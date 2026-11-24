// Name lists from the configuration (exclude, exposeScenarios): one name per entry, but "a, b" and quotes work too.
// Usage: npm run build && node test/config-list.mjs
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parseNameList } = await import(path.join(root, 'dist/configList.js'));

const cases = [
    ['one name per entry', ['io', ' rts '], ['io', 'rts']],
    ['several names with quotes in one entry', ['"io", "rts", "zigbee", "internal"'], ['"io", "rts", "zigbee", "internal"'.replace(/^"|"$/g, ''), 'io', 'rts', 'zigbee', 'internal']],
    ['typographic quotes', ['„Garage“'], ['Garage']],
    ['device name with a comma stays usable as a whole', ['Büro, links'], ['Büro, links', 'Büro', 'links']],
    ['empty and non-string entries are skipped', ['', '  ', null, 5, '""'], []],
    ['no list', undefined, []],
];
let failed = 0;
for (const [name, input, expected] of cases) {
    try {
        assert.deepEqual(parseNameList(input), expected);
        console.log('PASS ', name);
    } catch (error) {
        failed++;
        console.log('FAIL ', name, '\n', error.message);
    }
}
process.exit(failed ? 1 : 0);
