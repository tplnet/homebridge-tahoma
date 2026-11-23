// Gateway outage with the local API: the outage is logged once as a warning (no error lines while it lasts),
// the client reconnects by itself and logs the recovery once. Uses the simulated gateway (test/mock-gateway.mjs).
// Usage: npm run build && node test/outage.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tahoma-outage-test-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'key.pem'),
    '-out', path.join(tmp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const PORT = '18443';
const startGateway = () => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'test/mock-gateway.mjs'), path.join(tmp, 'key.pem'), path.join(tmp, 'cert.pem'), PORT]);
    child.stdout.on('data', (d) => d.toString().includes('listening') && resolve(child));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logs = [];
const log = { debug: (...a) => logs.push('DEBUG ' + a.join(' ')), info: (...a) => logs.push('INFO ' + a.join(' ')),
    warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERROR ' + a.join(' ')) };
const { default: Client } = await import(path.join(root, 'dist/overkiz/Client.js'));
const { default: LocalApiClient } = await import(path.join(root, 'dist/overkiz/LocalApiClient.js'));
// The local API listens on port 8443; point the client to the test port
const originalOpen = LocalApiClient.prototype.send;
LocalApiClient.prototype.send = function (method, p, body) {
    this.baseUrl = this.baseUrl.replace(':8443/', ':' + PORT + '/');
    return originalOpen.call(this, method, p, body);
};

let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); failed += ok ? 0 : 1; };

let gateway = await startGateway();
const client = new Client(log, { service: 'local', user: '127.0.0.1', password: 'testtoken', tlsInsecure: true, pollingPeriod: 1,
    refreshPeriod: 0 });
await client.getDevices();
await sleep(1500);
check('connected and polling', logs.some((l) => l.includes('Connected to gateway')));

gateway.kill();
await sleep(6000);
const during = logs.slice();
check('outage logged once as a warning', during.filter((l) => l.startsWith('WARN') && l.includes('Gateway not reachable')).length === 1);
check('no error lines during the outage', !during.some((l) => l.startsWith('ERROR')));
check('polling errors still in the debug log', during.some((l) => l.startsWith('DEBUG') && l.includes('Polling error')));

gateway = await startGateway();
await sleep(15000);
check('recovery logged once', logs.filter((l) => l.includes('Gateway reachable again')).length === 1);

gateway.kill();
client.removeAllListeners();
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) {
    console.log(logs.join('\n'));
}
process.exit(failed ? 1 : 0);
