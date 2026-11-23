import { EventEmitter } from 'events';
import Device from './models/Device.js';
import Execution, { ExecutionState, ExecutionError } from './models/Execution.js';
import LocalApiClient, { ApiLogger } from './LocalApiClient.js';
import CloudApiClient, { CLOUD_HOSTS } from './CloudApiClient.js';
import ActionGroup from './models/ActionGroup.js';

export interface ClientConfig {
    /** 'local' or a Somfy cloud service (somfy_europe, somfy_australia, somfy_north_america; old aliases accepted) */
    service?: string;
    /** Local API: gateway PIN or IPv4 address. Cloud: account e-mail */
    user: string;
    /** Local API: token from the TaHoma app. Cloud: account password */
    password: string;
    /** Local API only: skip the TLS certificate check of the gateway */
    tlsInsecure?: boolean;
    /** Event polling in seconds (default 5 local, 60 cloud) */
    pollingPeriod?: number;
    /** Event polling while a command is running, in seconds (default 2 local, 5 cloud) */
    execPollingPeriod?: number;
    /** Periodic full state refresh, in minutes (default 5 local, 1440 cloud, 0 = disabled) */
    refreshPeriod?: number;
}

/** The transport for the local API or the Somfy cloud */
interface Api extends EventEmitter {
    get(path: string, retry?: boolean): Promise<any>;
    post(path: string, data?: unknown, retry?: boolean): Promise<any>;
    delete(path: string, retry?: boolean): Promise<any>;
    put(path: string, data?: unknown, retry?: boolean): Promise<any>;
    /** True while the gateway / cloud is known to be unreachable (already logged once) */
    readonly unreachable: boolean;
}

// Cloud API: POST /setup/devices/states/refresh and GET /setup/devices are limited to 1 call per day and session
const CLOUD_REFRESH_MINUTES = 24 * 60;
const EXEC_TIMEOUT = 2 * 60 * 1000;
// No more state expected after these (the local API does not always send timeToNextState -1)
const TERMINAL_STATES: Array<string> = [
    ExecutionState.COMPLETED, ExecutionState.FAILED, ExecutionState.TIMED_OUT, ExecutionState.NOT_TRANSMITTED,
];
// The gateway accepts at most 10 simultaneous executions (EXEC_QUEUE_FULL)
const MAX_EXECUTIONS = 10;
// Upper bound (in seconds) of the back-off after event polling errors, e.g. while the gateway reboots
const MAX_POLLING_ERROR_LOCK = 300;
// setInterval() overflows above 2^31-1 ms
const MAX_TIMER_SECONDS = Math.floor(2147483647 / 1000);

/**
 * Client for a Somfy TaHoma gateway, via its local API (Developer Mode) or the Somfy cloud:
 * device setup, event polling and command execution.
 */
export default class Client extends EventEmitter {
    private readonly api: Api;
    public readonly isLocal: boolean;
    private refreshLock = false;

    private fetchLock = false;
    private executionPool: Record<string, Execution> = {};
    private executionTimeouts: Record<string, NodeJS.Timeout> = {};
    private devices: Record<string, Device> = {};

    private pollingPeriod: number;
    private readonly refreshPeriod: number;
    private readonly execPollingPeriod: number;
    private eventPollingPeriod = 0;
    private pollingErrorLockDuration = 10;

    private pollingTaskId: NodeJS.Timeout | null = null;
    private refreshTaskId: NodeJS.Timeout | null = null;
    private listenerId: null | string = null;

    constructor(private readonly log: ApiLogger, config: ClientConfig) {
        super();
        const service = String(config.service ?? 'somfy_europe').toLowerCase();
        this.isLocal = service === 'local';
        if (!this.isLocal && !CLOUD_HOSTS[service]) {
            throw new Error('Unsupported service "' + config.service + '"');
        }
        // The local API has no rate limit (Somfy: at most once per second), so poll faster there; the cloud keeps 60 s
        this.pollingPeriod = config.pollingPeriod || (this.isLocal ? 5 : 60);
        this.execPollingPeriod = config.execPollingPeriod || (this.isLocal ? 2 : 5);
        // Local: re-reads the gateway's states (cheap, no radio traffic) and catches events the gateway did not deliver.
        // Cloud: the bulk state refresh is allowed once per day and session.
        this.refreshPeriod = Math.min((config.refreshPeriod ?? (this.isLocal ? 5 : CLOUD_REFRESH_MINUTES)) * 60, MAX_TIMER_SECONDS);

        if (this.refreshPeriod === 0) {
            this.log.info('refreshPeriod is 0: periodic state refresh disabled.');
        } else if (!this.isLocal && this.refreshPeriod < CLOUD_REFRESH_MINUTES * 60) {
            this.log.warn('WARNING: refreshPeriod below ' + CLOUD_REFRESH_MINUTES + ' minutes exceeds the cloud API rate limit'
                + ' (1 state refresh per day) and leads to 429 QUOTA_EXCEEDED errors.');
        }
        if (!this.isLocal) {
            if (this.pollingPeriod < 10) {
                this.log.error('ERROR: pollingPeriod must be at least 10 seconds with the Somfy cloud.');
                this.pollingPeriod = 60;
            } else if (this.pollingPeriod < 30) {
                this.log.warn('WARNING: Setting pollingPeriod lower than 30 seconds is discouraged.');
            } else if (this.pollingPeriod > 60) {
                this.log.warn('WARNING: Setting pollingPeriod higher than 60 seconds can generate session timeout errors.');
            }
        }

        this.api = this.isLocal
            ? new LocalApiClient(log, config.user, config.password, config.tlsInsecure === true)
            : new CloudApiClient(log, service, config.user, config.password);
        this.api.on('connect', () => {
            this.emit('connect');
            this.setRefreshTaskPeriod(this.refreshPeriod);
            this.setPollingTaskPeriod(this.pollingPeriod);
        });
        this.api.on('disconnect', () => {
            this.emit('disconnect');
            this.setRefreshTaskPeriod(0);
            this.setPollingTaskPeriod(0);
        });
    }

    public hasExecution(execId?: string) {
        if (execId) {
            return execId in this.executionPool;
        } else {
            return Object.keys(this.executionPool).length > 0;
        }
    }

    /**
     * Run an execution and return its execId.
     * oid: 'apply', 'apply/highPriority' or the oid of a scenario (cloud only).
     * The local API only offers /exec/apply: high priority falls back to it, scenarios are not available.
     */
    async execute(oid: string, execution: Execution): Promise<string> {
        if (Object.keys(this.executionPool).length >= MAX_EXECUTIONS) {
            // Avoid EXEC_QUEUE_FULL: postpone by 10 sec
            await this.delay(10 * 1000);
            return await this.execute(oid, execution);
        }
        try {
            if (this.isLocal && oid !== 'apply') {
                if (oid === 'apply/highPriority') {
                    oid = 'apply';
                } else {
                    throw new Error('Not supported by the local API: /exec/' + oid);
                }
            }
            const data = await this.api.post('/exec/' + oid, execution);
            this.executionPool[data.execId] = execution;

            // Poll faster while the execution is running
            this.setPollingTaskPeriod(this.execPollingPeriod);

            // Auto remove execution in case of timeout (eg: listener event missed, listener registration fails)
            this.executionTimeouts[data.execId] = setTimeout(() => {
                this.executionPool[data.execId]?.onStateUpdate(ExecutionState.TIMED_OUT, null);
                this.removeExecution(data.execId);
            }, EXEC_TIMEOUT);

            return data.execId;
        } catch (error) {
            throw new ExecutionError(ExecutionState.FAILED, error);
        }
    }

    private removeExecution(execId: string) {
        delete this.executionPool[execId];
        clearTimeout(this.executionTimeouts[execId]);
        delete this.executionTimeouts[execId];
    }

    public async cancelExecution(execId: string) {
        return await this.api.delete('/exec/current/setup/' + execId);
    }

    private setRefreshTaskPeriod(period: number) {
        if (this.refreshTaskId) {
            clearInterval(this.refreshTaskId);
            this.refreshTaskId = null;
        }
        if (period > 0) {
            this.refreshTaskId = setInterval(() => {
                this.refreshAllStates().catch((error) => this.log.error('State refresh failed -', error));
            }, period * 1000);
        }
    }

    private setPollingTaskPeriod(period: number) {
        if (period === this.eventPollingPeriod) {
            return;
        }
        this.eventPollingPeriod = period;
        if (this.pollingTaskId) {
            clearInterval(this.pollingTaskId);
            this.pollingTaskId = null;
        }
        if (period > 0) {
            this.pollingTaskId = setInterval(this.pollingTask.bind(this), period * 1000);
            if (this.listenerId === null) {
                this.log.debug('Enable event polling every ' + period + ' sec');
                // Run immediately to register the listener
                this.pollingTask();
            } else {
                this.log.debug('Change event polling period to ' + period + ' sec');
            }
        } else {
            this.log.debug('Disable event polling');
            this.listenerId = null;
        }
    }

    private async pollingTask() {
        if (this.eventPollingPeriod !== this.pollingPeriod && !this.hasExecution()) {
            // Restore default polling frequency if no more execution in progress
            this.setPollingTaskPeriod(this.pollingPeriod);
        } else if (!this.fetchLock) {
            this.fetchLock = true;
            try {
                await this.fetchEvents();
            } finally {
                this.fetchLock = false;
            }
        }
    }

    private async fetchEvents() {
        if (this.listenerId !== null) {
            try {
                const events = await this.api.post('/events/' + this.listenerId + '/fetch', undefined, false);
                for (const event of events) {
                    if (event.name === 'DeviceStateChangedEvent') {
                        this.devices[event.deviceURL]?.updateStates(event.deviceStates);
                    } else if (event.name === 'ExecutionStateChangedEvent') {
                        const execution = this.executionPool[event.execId];
                        if (execution) {
                            execution.onStateUpdate(event.newState, event);
                            if (event.timeToNextState === -1 || TERMINAL_STATES.includes(event.newState)) {
                                this.removeExecution(event.execId);
                            }
                        }
                    } else if (event.name === 'RefreshAllDevicesStatesCompletedEvent') {
                        // Cloud: changed states arrive as DeviceStateChangedEvent
                        this.refreshLock = false;
                        this.log.debug('Refresh all states completed');
                    }
                }
                this.pollingErrorLockDuration = 10;
            } catch (error: unknown) {
                if (typeof error === 'string' && error.includes('400') && error.includes('No registered event listener')) {
                    // Expected after a gateway restart: register a new listener right away, no back-off
                    this.log.info('Event listener expired (gateway restarted?), registering a new one');
                    this.listenerId = null;
                } else {
                    this.logError('Polling error -', error);
                    if (typeof error === 'string' && (error.includes('400') || error.includes('401') || error.includes('404'))) {
                        // Listener not registered anymore (400/404) or token rejected (401)
                        this.listenerId = null;
                    }
                    await this.backOff();
                }
            }
        }
        if (this.listenerId === null) {
            try {
                const data = await this.api.post('/events/register');
                this.listenerId = data.id;
                this.pollingErrorLockDuration = 10;
            } catch (error) {
                this.logError('Event listener registration error -', error);
                await this.backOff();
            }
        }
    }

    /** Errors during a known outage (already logged once by the API client) go to the debug log only */
    private logError(message: string, error: unknown) {
        if (this.api.unreachable) {
            this.log.debug(message, error);
        } else {
            this.log.error(message, error);
        }
    }

    private async backOff() {
        await this.delay(this.pollingErrorLockDuration * 1000);
        this.pollingErrorLockDuration = Math.min(this.pollingErrorLockDuration * 2, MAX_POLLING_ERROR_LOCK);
    }

    private delay(duration: number) {
        return new Promise(resolve => setTimeout(resolve, duration));
    }

    /**
     * Group sub-devices (deviceURL#2, #3...) and sensors with their main device.
     */
    private attachDevices(data): Array<Device> {
        const devices: Array<Device> = data.map((device) => Object.assign(new Device(), device));
        let lastMainDevice: Device | null = null;
        let lastDevice: Device | null = null;
        let lastSubDevices: Array<Device> = [];
        const physicalDevices = new Array<Device>();
        devices.forEach((device) => {
            if (!this.devices[device.deviceURL]) {
                this.devices[device.deviceURL] = device;
            }
            if (device.isMainDevice()) {
                lastMainDevice = device;
                lastDevice = device;
                lastSubDevices = [device];
                physicalDevices.push(device);
            } else {
                if (lastDevice !== null && device.isSensorOf(lastDevice)) {
                    lastDevice.addSensor(device);
                } else if (lastMainDevice !== null && device.isSensorOf(lastMainDevice)) {
                    lastMainDevice.addSensor(device);
                } else {
                    let found = false;
                    for (const d of lastSubDevices) {
                        if (device.isSensorOf(d)) {
                            found = true;
                            d.addSensor(device);
                        }
                    }
                    if (!found) {
                        lastDevice = device;
                        lastSubDevices.push(device);
                        device.parent = lastMainDevice ?? undefined;
                        physicalDevices.push(device);
                    }
                }
            }
        });
        return physicalDevices;
    }

    public async getDevices(): Promise<Array<Device>> {
        const data = await this.api.get('/setup/devices');
        return this.attachDevices(data);
    }

    /**
     * Full state refresh.
     * Local API: re-read all devices and apply changed states (no state refresh command, but reading is not rate limited).
     * Cloud: ask the gateway to query the devices (allowed once per day and session); changes arrive as events.
     * GET /setup/devices is limited to once per day on the cloud as well, so it is not re-read there.
     */
    public async refreshAllStates() {
        if (this.isLocal) {
            const data = await this.api.get('/setup/devices');
            for (const fresh of data) {
                this.devices[fresh.deviceURL]?.updateStates(fresh.states ?? []);
            }
            return;
        }
        if (this.refreshLock) {
            return;
        }
        this.refreshLock = true;
        await this.api.post('/setup/devices/states/refresh').catch((error) => this.log.warn('State refresh failed:', error));
        setTimeout(() => this.refreshLock = false, 30 * 1000);
    }

    /**
     * Refresh the states of one device.
     * Local API: re-read its states from the gateway. Cloud: ask the gateway to query it (changes arrive as events).
     */
    public async refreshDeviceStates(deviceURL: string) {
        if (this.isLocal) {
            const states = await this.api.get('/setup/devices/' + encodeURIComponent(deviceURL) + '/states');
            this.devices[deviceURL]?.updateStates(states);
        } else {
            await this.api.post('/setup/devices/' + encodeURIComponent(deviceURL) + '/states/refresh');
        }
    }

    /**
     * Scenarios of the TaHoma app (cloud only, the local API has none).
     */
    public async getActionGroups(): Promise<Array<ActionGroup>> {
        if (this.isLocal) {
            this.log.warn('Scenarios are not available with the local API.');
            return [];
        }
        return this.api.get('/actionGroups');
    }
}
