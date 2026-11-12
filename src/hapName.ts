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
