import Action from './Action.js';

/** Scenario of the TaHoma app (cloud only) */
export default interface ActionGroup {
    oid: string;
    label: string;
    actions: Action[];
    metadata?: string;
}
