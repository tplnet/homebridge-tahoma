// Connection test of the settings page (src/setupCheck.ts) against the simulated gateway.
// Usage: npm run build && node test/setup-check.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { testConnection } = await import(path.join(root, 'dist/setupCheck.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tahoma-setup-check-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
const gateway = spawn(process.execPath, [path.join(root, 'test/mock-gateway.mjs'), path.join(tmp, 'key.pem'), path.join(tmp, 'cert.pem')]);
await new Promise((resolve) => gateway.stdout.on('data', (d) => String(d).includes('listening') && resolve()));

let failed = 0;
async function check(name, fn) {
    try {
        await fn();
        console.log('PASS ', name);
    } catch (error) {
        failed++;
        console.log('FAIL ', name, '\n', error.message);
    }
}

await check('local: connected, devices as the plugin shows them (without internal components)', async () => {
    const result = await testConnection({ service: 'local', user: '127.0.0.1', password: 'testtoken', tlsInsecure: true });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.apiVersion, '2026.1.4-1');
    assert.deepEqual(result.devices.map((d) => d.label), ['Büro kl.', 'Licht']);
    assert.equal(result.devices[0].protocol, 'io');
});
await check('local: wrong token is reported', async () => {
    const result = await testConnection({ service: 'local', user: '127.0.0.1', password: 'wrong', tlsInsecure: true });
    assert.equal(result.ok, false);
    assert.match(result.message, /401|token/i);
});
await check('local: gateway/token aliases are accepted', async () => {
    const result = await testConnection({ service: 'local', gateway: '127.0.0.1', token: 'testtoken', tlsInsecure: true });
    assert.equal(result.ok, true, result.message);
});
await check('invalid gateway is reported without a connection', async () => {
    const result = await testConnection({ service: 'local', user: 'not-a-gateway', password: 'x' });
    assert.equal(result.ok, false);
    assert.match(result.message, /Invalid gateway/);
});
await check('cloud: missing password is reported without a login', async () => {
    const result = await testConnection({ service: 'somfy_europe', user: 'a@example.com' });
    assert.equal(result.ok, false);
    assert.match(result.message, /password/);
});

gateway.kill('SIGTERM');
setTimeout(() => process.exit(failed ? 1 : 0), 300);
