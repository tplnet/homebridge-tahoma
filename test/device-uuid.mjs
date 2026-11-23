// Accessory IDs must stay exactly as in version 2 (overkiz-client with the uuid package), otherwise Apple Home would
// see every device as new and lose its rooms and automations. Compares the built-in calculation with the old one.
// Usage: npm run build && node test/device-uuid.mjs
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validate, v5 } from 'uuid';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: Device } = await import(path.join(root, 'dist/overkiz/models/Device.js'));
const NS = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';
const oldUuid = (oid, deviceURL) => (oid && oid.length > 0) ? (validate(oid) ? oid : v5(oid, NS)) : v5(deviceURL, NS);

const cases = [
    ['', 'io://1234-5678-9012/111'],                                  // no oid: from the device URL
    [undefined, 'rts://1234-5678-9012/16719623'],
    ['b2b6e0a1-1234-4abc-9def-001122334455', 'io://x/1'],             // valid UUID v4: used as is
    ['B2B6E0A1-1234-4ABC-9DEF-001122334455', 'io://x/2'],             // upper case
    ['b2b6e0a1-1234-0abc-9def-001122334455', 'io://x/3'],             // UUID-shaped, version 0: hashed
    ['b2b6e0a1-1234-4abc-0def-001122334455', 'io://x/4'],             // UUID-shaped, wrong variant: hashed
    ['00000000-0000-0000-0000-000000000000', 'io://x/5'],             // nil UUID
    ['ffffffff-ffff-ffff-ffff-ffffffffffff', 'io://x/6'],             // max UUID
    ['some-non-uuid-oid-777', 'io://x/7'],
    ['ü-Büro kl.', 'io://x/8'],                                       // non-ASCII
];
for (let i = 0; i < 200; i++) {
    cases.push([randomUUID(), 'io://1234-5678-9012/' + i]);
}
let failed = 0;
for (const [oid, deviceURL] of cases) {
    const device = Object.assign(new Device(), { oid, deviceURL });
    if (device.uuid !== oldUuid(oid, deviceURL)) {
        failed++;
        console.log(`FAIL  oid=${oid} deviceURL=${deviceURL}: ${device.uuid} instead of ${oldUuid(oid, deviceURL)}`);
    }
}
console.log(`${failed ? 'FAIL' : 'PASS'}  accessory IDs identical to version 2 (${cases.length} cases)`);
process.exit(failed ? 1 : 0);
