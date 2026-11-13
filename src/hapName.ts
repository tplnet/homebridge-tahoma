/**
 * HomeKit (HAP) accepts names that start and end with a letter or number and otherwise contain only
 * letters, numbers, spaces and ’ ' & ! . _ : ; ( ) / , -   Other names trigger HAP-NodeJS warnings and
 * may be rejected by the Home app.
 *
 * Turns a TaHoma label into such a name, e.g. "Büro kl." → "Büro kl", "IO (6649146)" → "IO 6649146".
 * The label in the TaHoma app is not changed.
 */
const VALID_NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N}\p{Zs}’'&!._:;()/,-]*[\p{L}\p{N}])?$/u;

export function hapName(label: string | undefined, fallback = 'Accessory'): string {
    const original = (label ?? '').trim();
    if (VALID_NAME.test(original)) {
        return original;
    }
    const name = original
        .replace(/\(([^()]*)\)/g, ' $1 ')                       // "IO (123)" -> "IO  123 "
        .replace(/[^\p{L}\p{N}\p{Zs}’'&!._:;()/,-]/gu, ' ') // unsupported characters -> space
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')       // must start and end with letter/number
        .replace(/\s+/g, ' ')
        .trim();
    return name || fallback;
}

/**
 * Default name the gateway uses for a device without a name of its own, e.g. "IO (5978041)" or "RTS (123456)".
 * The local API may report it for a while after a gateway restart, before the names from the TaHoma app
 * (cloud) are synchronised again.
 */
const DEFAULT_LABEL = /^[A-Za-z]+ \(\d{4,}\)$/;
const DEFAULT_NAME = /^[A-Za-z]+ \(?\d{4,}\)?$/;

export function isDefaultLabel(label: string | undefined): boolean {
    return DEFAULT_LABEL.test((label ?? '').trim());
}

export function isDefaultName(name: string | undefined): boolean {
    return DEFAULT_NAME.test((name ?? '').trim());
}
