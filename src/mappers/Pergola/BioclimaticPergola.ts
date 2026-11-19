import { Command } from '../../overkiz/index.js';
import Pergola from '../Pergola.js';

export default class BioclimaticPergola extends Pergola {
    protected getTargetCommands(value) {
        return new Command('setOrientation', this.reversedValue(value));
    }

    protected onStateChanged(name, value) {
        switch(name) {
            case 'core:SlatsOrientationState':
                this.updateCurrentPosition(this.reversedValue(value));
                if(this.isIdle) {
                    this.targetPosition?.updateValue(this.reversedValue(value));
                }
                break;
            default: break;
        }
    }
}