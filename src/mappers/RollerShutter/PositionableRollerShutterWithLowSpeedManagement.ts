import { Command } from 'overkiz-client';
import RollerShutter from '../RollerShutter.js';
export default class PositionableRollerShutterWithLowSpeedManagement extends RollerShutter {
    protected lowSpeed;

    protected applyConfig(config) {
        this.lowSpeed = config['lowSpeed'] || false;
    }

    protected getTargetCommands(value) {
        if (this.isLowSpeed) {
            return new Command('setClosureAndLinearSpeed', [this.reversedValue(value), 'lowspeed']);
        } else {
            return new Command('setClosure', this.reversedValue(value));
        }
    }

    protected get isLowSpeed() {
        if (this.lowSpeed === true) {
            return true;
        } else if (typeof this.lowSpeed === 'string') {
            // Time slot "HH:MM-HH:MM" (local time), may wrap around midnight
            const parts = this.lowSpeed.split(new RegExp('[-:]')).map((part) => parseInt(part));
            const date = new Date();
            const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
            const start = parts[0] * 60 + parts[1];
            const end = parts[2] * 60 + parts[3];
            if (end < start) {
                return now > start || now < end;
            } else {
                return now > start && now < end;
            }
        } else {
            return false;
        }
    }
}