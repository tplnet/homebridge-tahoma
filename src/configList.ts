/**
 * Name lists from the configuration (`exclude`, `exposeScenarios`).
 *
 * The settings form expects one name per entry, but entries like `"io", "rts"` (several names separated by commas,
 * with quotes) are easy to type. Each entry is kept as a whole – a device name may contain a comma – and, if it
 * contains commas, also split into its parts. Surrounding quotes and spaces are removed.
 */
const QUOTES = /^["'“”„‘’‚]+|["'“”„‘’‚]+$/g;

function clean(value: string): string {
    let previous: string;
    let result = value.trim();
    do {
        previous = result;
        result = result.replace(QUOTES, '').trim();
    } while (result !== previous);
    return result;
}

export function parseNameList(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }
    const names = new Set<string>();
    for (const value of values) {
        if (typeof value !== 'string') {
            continue;
        }
        const whole = clean(value);
        if (whole !== '') {
            names.add(whole);
        }
        if (value.includes(',')) {
            for (const part of value.split(',')) {
                const name = clean(part);
                if (name !== '') {
                    names.add(name);
                }
            }
        }
    }
    return [...names];
}
