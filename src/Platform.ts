import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { Client, Execution, Action } from 'overkiz-client';
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
export class Platform implements DynamicPlatformPlugin {
    // this is used to track restored cached accessories
    private readonly accessories: PlatformAccessory[] = [];
    public readonly client: Client;

    private readonly exclude: Array<string>;
    private readonly exposeScenarios: boolean | Array<string>;
    public readonly devicesConfig: Array<unknown> = [];

    private translations;
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

        this.exclude = config.exclude || [];
        this.exclude.push('Pod', 'ConfigurationComponent', 'NetworkComponent', 'ProtocolGateway', 'ConsumptionSensor',
            'OnOffHeatingSystem', 'Wifi', 'RemoteController',
            // AtlanticElectricalTowelDryer bad sensors
            'io:LightIOSystemDeviceSensor', 'io:RelativeHumidityIOSystemDeviceSensor', 'enocean:EnOceanHumidityComfortSensor',
            'WeatherForecastSensor',
        );
        this.exposeScenarios = config.exposeScenarios;
        config.devicesConfig?.forEach(x => this.devicesConfig[x.key] = x);

        const logger = Object.assign({}, log, {
            debug: (...args) => {
                if (config['debug']) {
                    log.info('\x1b[90m', ...args);
                } else {
                    log.debug(args.shift(), ...args);
                }
            },
        });
        this.client = new Client(logger, config);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            this.discoverDevices();
            if (this.config['service'] !== 'local') {
                this.loadLocation();
            }
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    async loadLocation() {
        let countryCode = 'en';
        const location = await this.client.getSetupLocation().catch((error) => this.log.warn('Fail to load lang file:', error));
        if (location?.countryCode) {
            countryCode = location.countryCode.toLowerCase().trim();
        }
        this.translations = await import(`./lang/${countryCode}.json`, { with: { type: 'json' } })
            .catch(() => import('./lang/en.json', { with: { type: 'json' } }))
            .then((c) => c.default);

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

            // loop over the discovered devices and register each one if it has not already been registered
            for (const device of devices) {
                if (
                    this.exclude.includes(device.definition.uiClass) ||
                    this.exclude.includes(device.definition.widgetName) ||
                    this.exclude.includes(device.controllableName) ||
                    this.exclude.includes(device.label) ||
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
                    if (this.exclude.includes(actionGroup.label) || actionGroup.label.startsWith('internal:') || actionGroup.label === '') {
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
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, deleted);
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
     * Translate
     * @param path 
     * @returns string
     */
    public translate(label: string): string | null {
        const path = label.split('.');
        let translation = this.translations;
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
        return label;
    }
}
