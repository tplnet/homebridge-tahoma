/**
 * Which cached accessories are removed after a device discovery.
 *
 * - hidden: devices the user hid on purpose (`exclude`) – always removed, a deliberate configuration change.
 * - missing: accessories the gateway no longer reports. If more than half of all accessories (at least 3) would
 *   disappear at once, something is probably wrong (gateway, changed IDs) – they are kept (safety stop).
 */
export interface RemovalPlan<T> {
    hidden: T[];
    missing: T[];
    keepMissing: boolean;
}

export function planRemoval<T extends { UUID: string }>(cached: T[], reported: Set<string>, hidden: Set<string>): RemovalPlan<T> {
    const gone = cached.filter((accessory) => !reported.has(accessory.UUID));
    const hiddenAccessories = gone.filter((accessory) => hidden.has(accessory.UUID));
    const missing = gone.filter((accessory) => !hidden.has(accessory.UUID));
    return {
        hidden: hiddenAccessories,
        missing,
        keepMissing: missing.length >= 3 && missing.length * 2 > cached.length,
    };
}
