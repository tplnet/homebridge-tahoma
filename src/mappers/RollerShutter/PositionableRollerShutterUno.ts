import RollerShutter from '../RollerShutter.js';
export default class PositionableRollerShutterUno extends RollerShutter {
    protected onStateChanged(name: string, value) {
        switch(name) {
            case 'core:TargetClosureState':
                if(this.isIdle) {
                    this.targetPosition?.updateValue(this.reversedValue(value));
                }
                this.updateCurrentPosition(this.reversedValue(value));
                break;
        }
    }
}