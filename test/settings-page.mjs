// Helpers of the settings page (homebridge-ui/public/setup.js).
// Usage: node test/settings-page.mjs
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { configLabel, applyGateway, missingSettings, describeResult } = await import(path.join(root, 'homebridge-ui/public/setup.js'));

let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log('PASS ', name);
    } catch (error) {
        failed++;
        console.log('FAIL ', name, '\n', error.message);
    }
}

check('configuration label with and without name', () => {
    assert.equal(configLabel({ name: 'TaHoma', service: 'local' }, 0), 'TaHoma – Local API');
    assert.equal(configLabel({ service: 'somfy_europe' }, 1), 'Configuration 2 – Somfy cloud (Europe)');
});
check('a found gateway is set with its IP address or PIN, the alias is removed', () => {
    const gateway = { pin: '1234-5678-9012', ip: '192.0.2.10' };
    const config = { name: 'TaHoma', service: 'somfy_europe', gateway: 'old', password: 'token' };
    assert.deepEqual(applyGateway(config, gateway), { name: 'TaHoma', service: 'local', user: '192.0.2.10', password: 'token' });
    assert.equal(applyGateway(config, gateway, 'pin').user, '1234-5678-9012');
    assert.equal(config.gateway, 'old', 'the original config is not changed');
});
check('missing settings are reported before a test', () => {
    assert.match(missingSettings({ service: 'local' }), /PIN or IP/);
    assert.match(missingSettings({ service: 'local', user: '192.0.2.10' }), /token/);
    assert.equal(missingSettings({ service: 'local', gateway: '192.0.2.10', token: 't' }), undefined);
    assert.match(missingSettings({ service: 'somfy_europe', user: 'a@example.com' }), /Somfy account/);
});
check('test results are described for the page', () => {
    assert.equal(describeResult({ ok: false, message: 'Token rejected' }).kind, 'danger');
    const ok = describeResult({ ok: true, message: 'Connected', devices: [{}, {}] });
    assert.equal(ok.kind, 'success');
    assert.match(ok.lines[1], /^2 devices/);
});
process.exit(failed ? 1 : 0);
