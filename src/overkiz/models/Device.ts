import { EventEmitter } from 'events';
import { createHash } from 'crypto';

// Namespace for UUIDv5 (RFC 4122, X.500 DN). Do not change: it defines the HomeKit accessory IDs.
const UUID_NAMESPACE = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';
// Same check as validate() of the uuid package used before version 3: accessory IDs must not change
const UUID_REGEXP = new RegExp('^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
    + '|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$', 'i');

/** Name based UUID version 5 (SHA-1), RFC 4122. */
export function uuidV5(name: string, namespace = UUID_NAMESPACE): string {
    const hash = createHash('sha1').update(Buffer.from(namespace.replace(/-/g, ''), 'hex')).update(name, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface State {
    name: string;
    type: number;
    value: any;
}

export interface CommandDefinition {
    commandName: string;
    nparams: number;
}

export interface Definition {
    type: string;
    widgetName: string;
    uiClass: string;
    commands: CommandDefinition[];
}

export default class Device extends EventEmitter {
    oid = '';
    deviceURL = '';
    label = '';
    controllableName = '';
    states: Array<State> = [];

    pendingUpdate = new Map<string, State>();
    pendingUpdateTimer;

    public definition: Definition = { type: '', widgetName: '', uiClass: '', commands: [] };

    public parent: Device | undefined;
    public sensors: Device[] = [];

    get uuid() {
        if (this.oid && this.oid.length > 0) {
            return UUID_REGEXP.test(this.oid) ? this.oid : uuidV5(this.oid);
        }
        return uuidV5(this.deviceURL);
    }

    get componentId() {
        const pos = this.deviceURL.indexOf('#');
        if (pos === -1) {
            return 1;
        } else {
            return parseInt(this.deviceURL.substring(pos + 1));
        }
    }

    get manufacturer() {
        const manufacturer = this.get('core:ManufacturerNameState');
        return manufacturer !== null ? manufacturer : 'Somfy';
    }

    get model() {
        const model = this.get('core:ModelState');
        return model !== null ? model : this.definition.uiClass;
    }

    get address() {
        const regex = /[//](.)*[/]/;
        return this.deviceURL.replace(regex, '');
    }

    get protocol(): string {
        return this.controllableName.split(':').shift() || '';
    }

    get uniqueName(): string {
        return this.controllableName.split(':').pop() || '';
    }

    get commands(): Array<string> {
        return this.definition.commands.map((command: CommandDefinition) => command.commandName);
    }

    hasCommand(name: string): boolean {
        return this.definition.commands.find((command: CommandDefinition) => command.commandName === name) !== undefined;
    }

    hasState(name: string): boolean {
        return this.states.find((state: State) => state.name === name) !== undefined;
    }

    hasSensor(widget: string): boolean {
        return this.sensors.find((sensor) => sensor.definition.widgetName === widget) !== undefined;
    }

    isMainDevice() {
        return this.componentId === 1;
    }

    isSensorOf(device: Device) {
        switch (this.controllableName) {
            case 'io:AtlanticPassAPCOutsideTemperatureSensor':
                return false;//device.isMainDevice();
            case 'io:AtlanticPassAPCZoneTemperatureSensor':
                return device.definition.uiClass === 'HeatingSystem';
            case 'io:HeatingRelatedElectricalEnergyConsumptionSensor':
                return device.controllableName === 'io:AtlanticPassAPCHeatPumpMainComponent';
            case 'io:DHWRelatedElectricalEnergyConsumptionSensor':
                return device.controllableName === 'io:AtlanticPassAPCDHWComponent';
            case 'io:CumulatedElectricalEnergyConsumptionIOSystemDeviceSensor':
                return device.controllableName === 'io:AtlanticElectricalHeaterWithAdjustableTemperatureSetpointIOComponent' ||
                    device.controllableName === 'io:AtlanticElectricalTowelDryerIOComponent';
            default:
                break;
        }
        switch (this.definition.widgetName) {
            case 'TemperatureSensor':
                return device.definition.uiClass === 'HeatingSystem';
            default:
                break;
        }
    }

    addSensor(device: Device) {
        device.parent = this;
        this.sensors.push(device);
    }

    getState(stateName): State | null {
        if (this.states !== null) {
            for (const state of this.states) {
                if (state.name === stateName) {
                    return state;
                }
            }
        }
        return null;
    }

    updateStates(states: State[]) {
        if (this.pendingUpdateTimer !== null) {
            clearTimeout(this.pendingUpdateTimer);
        }
        for (const newState of states) {
            const state = this.getState(newState.name);
            if (state) {
                // Ignore state type 10 and 11 (object and array of object)
                if (state.type !== 10 && state.type !== 11 && state.value !== newState.value) {
                    state.value = newState.value;
                    this.pendingUpdate.set(newState.name, newState);
                }
            } else {
                this.states.push(newState);
                this.pendingUpdate.set(newState.name, newState);
            }
        }
        this.pendingUpdateTimer = setTimeout(() => {
            this.pendingUpdateTimer = null;
            if (this.pendingUpdate.size > 0) {
                this.emit('states', Array.from(this.pendingUpdate.values()));
                this.pendingUpdate = new Map();
            }
        }, 100);
    }

     
    get(stateName): any | null {
        if (this.states !== null) {
            for (const state of this.states) {
                if (state.name === stateName) {
                    return state.value;
                }
            }
        }
        return null;
    }

    getNumber(stateName): number {
        const val = this.get(stateName);
        return val ? Number.parseFloat(val) : 0;
    }
}