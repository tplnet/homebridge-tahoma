import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { parseNameList } from './configList.js';
import { Client, Execution, Action } from './overkiz/index.js';
import defaultTranslations from './lang/en.json' with { type: 'json' };
import Mapper from './Mapper.js';
import SceneMapper from './SceneMapper.js';
import { CustomCharacteristics } from './CustomCharacteristics.js';
import { BLUE, GREY, RESET } from './colors.js';
import { hapName, isDefaultLabel, isDefaultName } from './hapName.js';


export let Services: typeof Service;
export let Characteristics: typeof Characteristic;

const DEFAULT_RETRY_DELAY = 60;
const MAX_RETRY_DELAY = 300;

// Process-wide handlers must be installed once, even with several Tahoma platforms configured.
let processHandlersInstalled = false;

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
/** Services supported in version 3: Somfy TaHoma only (local API and Somfy cloud, incl. the old aliases) */
export const SOMFY_SERVICES = ['local', 'somfy_europe', 'somfy_australia', 'somfy_north_america', 'tahoma', 'tahoma_switch', 'connexoon',
    'connexoon_rts'];

export class Platform implements DynamicPlatformPlugin {
    // this is used to track restored cached accessories
    private readonly accessories: PlatformAccessory[] = [];
    public readonly client!: Client;

    private readonly exclude: Array<string>;
    private readonly exposeScenarios: boolean | Array<string>;
    public readonly devicesConfig: Array<unknown> = [];

    private executionPromise;
    private retryDelay = DEFAULT_RETRY_DELAY;
    // UUIDs already mapped: a discovery retry after a partial failure must not build them twice
    // (that would attach duplicate state listeners)
    private readonly mapped = new Set<string>();

    constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
        Services = this.api.hap.Service;
        Characteristics = this.api.hap.Characteristic;
        new CustomCharacteristics(this.api.hap);
        this.log.debug('Finished initializing platform:', this.config.name);

        if (!processHandlersInstalled) {
            processHandlersInstalled = true;
            process.on('unhandledRejection', (error: any) => this.log.error('Unhandled rejection:', error));
            process.on('uncaughtException', (error: any) => this.log.error('Uncaught exception:', error));
        }

        // Entries may contain the name from the TaHoma app or the name shown in Apple Home / the log
        // One name per entry; "a, b" and quotes are accepted as well (see configList.ts)
        this.exclude = parseNameList(config.exclude);
        this.exclude.push('Pod', 'ConfigurationComponent', 'NetworkComponent', 'ProtocolGateway', 'ConsumptionSensor',
            'OnOffHeatingSystem', 'Wifi', 'RemoteController',
            // AtlanticElectricalTowelDryer bad sensors
            'io:LightIOSystemDeviceSensor', 'io:RelativeHumidityIOSystemDeviceSensor', 'enocean:EnOceanHumidityComfortSensor',
            'WeatherForecastSensor',
        );
        this.exposeScenarios = Array.isArray(config.exposeScenarios) ? parseNameList(config.exposeScenarios) : config.exposeScenarios;
        // Entries without a device name (e.g. an empty entry added by the settings form) apply to nothing: skip them
        config.devicesConfig?.filter((x) => typeof x?.key === 'string' && x.key.trim() !== '')
            .forEach((x) => this.devicesConfig[x.key.trim()] = x);

        const logger = Object.assign({}, log, {
            debug: (...args) => {
                if (config['debug']) {
                    log.info('\x1b[90m', ...args);
                } else {
                    log.debug(args.shift(), ...args);
                }
            },
        });
        // Version 3 supports Somfy TaHoma only (local API and Somfy cloud). Other Overkiz services are refused with a
        // clear message; the platform then stays inactive, so the cached accessories are kept for a downgrade to 2.x.
        const service = String(config['service'] ?? 'somfy_europe').toLowerCase();
        if (!SOMFY_SERVICES.includes(service)) {
            this.log.error(`The service '${config['service']}' is not supported anymore: version 3 of this plugin supports Somfy TaHoma `
                + 'only (local API and Somfy cloud). To keep using it, install version 2.x (Homebridge UI → plugin → Manage Version) '
                + 'or the original homebridge-tahoma. The plugin does nothing until then.');
            return;
        }
        try {
            this.client = new Client(logger, {
                service,
                // gateway / token (names of homebridge-tahoma-local) are accepted as aliases for the local API
                user: config['user'] ?? config['gateway'],
                password: config['password'] ?? config['token'],
                tlsInsecure: config['tlsInsecure'],
                pollingPeriod: config['pollingPeriod'],
                execPollingPeriod: config['execPollingPeriod'],
                refreshPeriod: config['refreshPeriod'],
            });
        } catch (error: any) {
            // e.g. missing credentials or an invalid gateway PIN / IP address: a clear message instead of a crash
            this.log.error((error?.message ?? String(error)) + ' – the plugin does nothing until the configuration is fixed.');
            return;
        }

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    async configureAccessory(accessory: PlatformAccessory) {
        if (!this.accessories.map((a) => a.UUID).includes(accessory.UUID)) {
            this.accessories.push(accessory);
        }
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices() {
        try {
            const uuids = Array<string>();
            const renamed = Array<PlatformAccessory>();
            const devices = await this.client.getDevices();
            this.log.debug(devices.length + ' devices discovered');

            // Safety stop: if none of the cached accessories matches a device of the gateway, the device IDs have
            // changed (e.g. switch between cloud and local API) or something is wrong. Creating new accessories
            // and removing the old ones would make Apple Home lose all rooms, scenes and automations.
            const cachedUuids = new Set(this.accessories.map((accessory) => accessory.UUID));
            if (cachedUuids.size > 0 && devices.length > 0 && !devices.some((device) => cachedUuids.has(device.uuid))) {
                this.log.error(`Safety stop: none of the ${cachedUuids.size} cached accessories matches one of the `
                    + `${devices.length} devices of the gateway. Nothing is created or removed, so your accessories, rooms and `
                    + 'automations stay as they are. If you switched between the Somfy cloud and the local API on purpose, '
                    + 'remove the cached accessories of this bridge in the Homebridge UI (Settings → Remove cached accessories) '
                    + 'and restart; otherwise please report this with the log.');
                return;
            }

            // loop over the discovered devices and register each one if it has not already been registered
            for (const device of devices) {
                if (
                    this.exclude.includes(device.definition.uiClass) ||
                    this.exclude.includes(device.definition.widgetName) ||
                    this.exclude.includes(device.controllableName) ||
                    this.exclude.includes(device.label) ||
                    this.exclude.includes(hapName(device.label)) ||
                    this.exclude.includes(device.protocol)
                ) {
                    continue;
                }

                // see if an accessory with the same uuid has already been registered and restored from
                // the cached devices we stored in the `configureAccessory` method above
                let accessory = this.accessories.find(accessory => accessory.UUID === device.uuid);

                if (accessory) {
                    // the accessory already exists: fix a cached name that HomeKit does not accept
                    if (isDefaultLabel(device.label) && !isDefaultName(accessory.displayName)) {
                        // The gateway reports its default name (e.g. after a restart, before the names from the
                        // TaHoma app are synchronised again): keep the name we already have
                        this.log.debug(`Gateway reports default name '${device.label}' for '${accessory.displayName}', keeping it`);
                    } else {
                        this.renameCachedAccessory(accessory, hapName(device.label), renamed);
                    }
                } else {
                    // the accessory does not yet exist, so we need to create it
                    this.log.info('Create accessory:', device.label);
                    accessory = new this.api.platformAccessory(hapName(device.label), device.uuid);
                    //accessory.context.device = device;
                    await this.configureAccessory(accessory);
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }

                this.log.info(`Configure device ${BLUE}${accessory.displayName}${RESET}`);
                this.log.info(`${GREY}  ${device.definition.uiClass} > ${device.definition.widgetName}`);

                // eslint-disable-next-line max-len
                const mapper = await import(`./mappers/${device.definition.uiClass}/${device.definition.widgetName}/${device.uniqueName}.js`)
                    .catch(() => import(`./mappers/${device.definition.uiClass}/${device.definition.widgetName}.js`))
                    .catch(() => import(`./mappers/${device.definition.uiClass}.js`))
                    .then((c) => c.default)
                    .catch(() => ({ default: Mapper }));
                if (!this.mapped.has(device.uuid)) {
                    new mapper(this, accessory, device).build();
                    this.mapped.add(device.uuid);
                }

                uuids.push(device.uuid);
            }


            if (this.exposeScenarios) {
                // Scenarios are optional: a failure here must not abort device discovery
                const actionGroups = await this.client.getActionGroups().catch((error) => {
                    this.log.warn('Unable to load scenarios:', error);
                    return [];
                });

                for (const actionGroup of actionGroups) {
                    if (this.exclude.includes(actionGroup.label) || this.exclude.includes(hapName(actionGroup.label, 'Scenario')) ||
                        actionGroup.label.startsWith('internal:') || actionGroup.label === '') {
                        continue;
                    }
                    // A list of names exposes only these scenarios
                    if (Array.isArray(this.exposeScenarios) && !this.exposeScenarios.includes(actionGroup.label) &&
                        !this.exposeScenarios.includes(hapName(actionGroup.label, 'Scenario'))) {
                        continue;
                    }

                    let accessory = this.accessories.find(accessory => accessory.UUID === actionGroup.oid);

                    if (accessory) {
                        this.renameCachedAccessory(accessory, hapName(actionGroup.label, 'Scenario'), renamed);
                    } else {
                        // the accessory does not yet exist, so we need to create it
                        this.log.info('Create accessory', actionGroup.label);
                        accessory = new this.api.platformAccessory(hapName(actionGroup.label, 'Scenario'), actionGroup.oid);
                        await this.configureAccessory(accessory);
                        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                    }

                    this.log.info('Map scene', accessory.displayName);

                    if (!this.mapped.has(actionGroup.oid)) {
                        new SceneMapper(this, accessory, actionGroup);
                        this.mapped.add(actionGroup.oid);
                    }
                    uuids.push(actionGroup.oid);
                }
            }

            if (renamed.length > 0) {
                // persist the new names in the accessory cache
                this.api.updatePlatformAccessories(renamed);
            }

            const deleted = this.accessories.filter((accessory) => !uuids.includes(accessory.UUID));
            if (deleted.length >= 3 && deleted.length * 2 > this.accessories.length) {
                // Safety stop: more than half of the accessories would disappear at once - keep them
                this.log.warn(`Safety stop: ${deleted.length} of ${this.accessories.length} accessories are no longer reported by `
                    + 'the gateway, they are kept: ' + deleted.map((accessory) => accessory.displayName).join(', ')
                    + '. If you removed these devices in the TaHoma app on purpose, remove them in the Homebridge UI '
                    + '(Settings → Remove single cached accessory).');
            } else if (deleted.length > 0) {
                this.log.info('Remove accessories no longer reported by the gateway: '
                    + deleted.map((accessory) => accessory.displayName).join(', '));
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, deleted);
            }
            this.retryDelay = DEFAULT_RETRY_DELAY;

            // Cloud: getDevices() only returns the stored snapshot, which can be stale for changes
            // made outside HomeKit. Refresh once now (fresh session, within the 1/day limit) instead
            // of waiting a full refreshPeriod. Not needed locally (devices were just read from the
            // gateway) and skipped when the periodic refresh is disabled (refreshPeriod: 0).
            if (!this.client.isLocal && this.config['refreshPeriod'] !== 0) {
                this.client.refreshAllStates().catch((error: any) =>
                    this.log.debug('Initial state refresh failed:', error?.message ?? error));
            }
        } catch (error: any) {
            this.log.error(error);
            this.log.error('Retry in ' + this.retryDelay + ' sec...');
            setTimeout(this.discoverDevices.bind(this), this.retryDelay * 1000);
            this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY);
        }
    }

    /**
     * Give a cached accessory a HomeKit compatible name (see hapName), e.g. "Büro kl." -> "Büro kl".
     */
    private renameCachedAccessory(accessory: PlatformAccessory, name: string, renamed: Array<PlatformAccessory>) {
        if (accessory.displayName !== name) {
            // Either renamed in the TaHoma app or adjusted to the naming rules of Apple Home (see hapName)
            this.log.info(`Rename accessory '${accessory.displayName}' to '${name}'`);
            accessory.updateDisplayName(name);
            renamed.push(accessory);
        }
    }

    /*
        action: The action to execute
    */
    public executeAction(label: string, action: Action, highPriority = false, standalone = false) {
        if (standalone) {
            // Run action in standalone execution
            return this.client.execute(highPriority ? 'apply/highPriority' : 'apply', new Execution(label + ' - Apple Home', action));
        } else {
            if (this.executionPromise) {
                this.executionPromise.execution.addAction(action);
                this.executionPromise.execution.label = 'Execute scene (' +
                    this.executionPromise.execution.actions.length + ' devices) - Apple Home';
            } else {
                this.executionPromise = new Promise((resolve, reject) => {
                    setTimeout(() => {
                        this.client.execute(highPriority ? 'apply/highPriority' : 'apply', this.executionPromise.execution)
                            .then(resolve)
                            .catch(reject);
                        this.executionPromise = null;
                    }, 100);
                });
                this.executionPromise.execution = new Execution(label + ' - Apple Home', action);
            }
            return this.executionPromise;
        }
    }

    /**
     * Human readable label of a command, e.g. "setClosure.30" -> "Close 30%" (with the Somfy cloud shown in the TaHoma app history).
     */
    public translate(label: string): string {
        const path = label.split('.');
        let translation: any = defaultTranslations;
        for (const key of path) {
            if (typeof translation === 'object' && key in translation) {
                translation = translation[key];
            } else if (typeof translation === 'string') {
                if (translation.includes(':param')) {
                    translation = translation.replace(':param', key);
                }
                return translation;
            }
        }
        return typeof translation === 'string' ? translation : label;
    }
}
