// Helpers of the settings page (homebridge-ui/public/setup.js).
// Usage: node test/settings-page.mjs
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { configLabel, gatewaysOf, isUsed, applyGateway, addAdditionalGateway, missingSettings, describeResult, describeInstallation } =
    await import(path.join(root, 'homebridge-ui/public/setup.js'));

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
const found = { pin: '1234-5678-9012', ip: '192.0.2.10' };
const second = { pin: '2222-3333-4444', ip: '192.0.2.11' };

check('configuration label with and without name', () => {
    assert.equal(configLabel({ name: 'TaHoma', service: 'local' }, 0), 'TaHoma – Local API');
    assert.equal(configLabel({ service: 'somfy_europe' }, 1), 'Configuration 2 – Somfy cloud (Europe)');
});
check('gateways of a configuration: first and additional ones (local), the account (cloud)', () => {
    const config = { service: 'local', user: '192.0.2.10', additionalGateways: [{ gateway: ' 192.0.2.11 ', token: 't' }, { token: 'x' }] };
    assert.deepEqual(gatewaysOf(config).map((g) => [g.role, g.address]), [['first', '192.0.2.10'], ['additional', '192.0.2.11']]);
    assert.deepEqual(gatewaysOf({ service: 'somfy_europe', user: 'a@example.com', additionalGateways: [{ gateway: 'x' }] })
        .map((g) => g.role), ['cloud']);
});
check('a found gateway is used as first gateway with its IP address or PIN, the alias is removed', () => {
    const config = { name: 'TaHoma', service: 'somfy_europe', gateway: 'old', password: 'token' };
    assert.deepEqual(applyGateway(config, found), { name: 'TaHoma', service: 'local', user: '192.0.2.10', password: 'token' });
    assert.equal(applyGateway(config, found, 'pin').user, '1234-5678-9012');
    assert.equal(config.gateway, 'old', 'the original config is not changed');
});
check('a found gateway is added as further gateway once, empty form entries are dropped', () => {
    const config = { service: 'local', user: '192.0.2.10', password: 't', additionalGateways: [{}] };
    const result = addAdditionalGateway(config, second);
    assert.deepEqual(result.additionalGateways, [{ gateway: '192.0.2.11', token: '' }]);
    assert.equal(addAdditionalGateway(result, second), result, 'not added twice');
    assert.equal(addAdditionalGateway(result, found), result, 'the first gateway is not added again');
    assert.equal(isUsed(result, { pin: '2222-3333-4444', ip: '192.0.2.99' }), false);
    assert.equal(isUsed({ service: 'local', user: '2222-3333-4444' }, second), true, 'matched by PIN');
});
check('missing settings are reported before a test', () => {
    assert.match(missingSettings({ service: 'local' }), /PIN or IP/);
    assert.match(missingSettings({ service: 'local', user: '192.0.2.10' }), /token/);
    assert.equal(missingSettings({ service: 'local', gateway: '192.0.2.10', token: 't' }), undefined);
    assert.match(missingSettings({ service: 'local', user: '192.0.2.10', password: 't', additionalGateways: [{ gateway: '192.0.2.11' }] }),
        /additional gateway 192\.0\.2\.11/);
    assert.match(missingSettings({ service: 'somfy_europe', user: 'a@example.com' }), /Somfy account/);
});
check('test results are described for the page', () => {
    assert.equal(describeResult({ ok: false, message: 'Token rejected' }).kind, 'danger');
    assert.match(describeResult({ ok: true, message: 'Connected', devices: [{}, {}] }).text, /2 devices/);
    assert.equal(describeInstallation({ gateways: [{ ok: true }, { ok: false }] }).title, 'One gateway failed');
    assert.match(describeInstallation({ gateways: [{ ok: true }], devices: [{}, {}, {}] }).title, /^Connection works – 3 devices/);
});
process.exit(failed ? 1 : 0);
