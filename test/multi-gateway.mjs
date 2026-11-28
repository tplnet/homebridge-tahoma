// Several gateways in one configuration (additionalGateways): start Homebridge with two simulated gateways
// (127.0.0.1 and 127.0.0.2, served by one mock that answers per address) and check that
// - the devices of both gateways are created, a device reported by both only once,
// - a command goes to the gateway of its device.
// Needs 127.0.0.2 on the loopback interface (Linux: always; macOS: `sudo ifconfig lo0 alias 127.0.0.2`).
// Run after `npm run build`: node test/multi-gateway.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tahoma-multi-gateway-'));
const PIN = '031-45-154';
const HAP_PORT = 51898;
const TIMEOUT = 60 * 1000;
const children = [];

function cleanup(code) {
    children.forEach((child) => child.kill('SIGTERM'));
    setTimeout(() => process.exit(code), 500);
}
function fail(message) {
    console.error('MULTI-GATEWAY TEST FAILED:', message);
    cleanup(1);
}
function waitFor(getLog, pattern, label) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if (pattern.test(getLog())) {
                clearInterval(timer);
                resolve();
            } else if (Date.now() - start > TIMEOUT) {
                clearInterval(timer);
                reject(new Error('timeout waiting for ' + label));
            }
        }, 250);
    });
}

execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
let gatewayLog = '';
const gateway = spawn(process.execPath, [path.join(root, 'test/mock-gateway.mjs'), path.join(tmp, 'key.pem'), path.join(tmp, 'cert.pem')]);
gateway.stdout.on('data', (d) => gatewayLog += d);
children.push(gateway);

const storage = path.join(tmp, 'storage');
const plugins = path.join(tmp, 'plugins', '@tplnet');
fs.mkdirSync(storage, { recursive: true });
fs.mkdirSync(plugins, { recursive: true });
fs.symlinkSync(root, path.join(plugins, 'homebridge-tahoma'));
fs.writeFileSync(path.join(storage, 'config.json'), JSON.stringify({
    bridge: { name: 'Multi Gateway Test', username: '0E:11:22:33:44:98', port: HAP_PORT, pin: PIN },
    platforms: [{
        platform: 'Tahoma', name: 'TaHoma', service: 'local', user: '127.0.0.1', password: 'testtoken', tlsInsecure: true, pollingPeriod: 1,
        additionalGateways: [{ gateway: '127.0.0.2', token: 'testtoken' }, { gateway: '127.0.0.2', token: 'testtoken' }],
    }],
}));

let hbLog = '';
const homebridgeDir = process.env.HOMEBRIDGE_DIR || path.join(root, 'node_modules', 'homebridge');
const homebridgePkg = JSON.parse(fs.readFileSync(path.join(homebridgeDir, 'package.json'), 'utf8'));
const homebridgeBin = path.join(homebridgeDir, typeof homebridgePkg.bin === 'string' ? homebridgePkg.bin : homebridgePkg.bin.homebridge);
const homebridge = spawn(process.execPath, [homebridgeBin, '-U', storage, '-P', path.join(tmp, 'plugins'), '-I', '--strict-plugin-resolution', '-Q', '-D']);
// eslint-disable-next-line no-control-regex
const plain = (d) => String(d).replace(/\x1b\[[0-9;]*m/g, '');
homebridge.stdout.on('data', (d) => hbLog += plain(d));
homebridge.stderr.on('data', (d) => hbLog += plain(d));
children.push(homebridge);
homebridge.on('exit', (code) => fail('Homebridge exited with code ' + code + '\n' + hbLog));

let failed = 0;
const pass = (name) => console.log('PASS ', name);
const check = (condition, name, detail = '') => {
    if (condition) {
        pass(name);
    } else {
        failed++;
        console.log('FAIL ', name, detail);
    }
};

try {
    await waitFor(() => gatewayLog, /listening/, 'mock gateway');
    await waitFor(() => hbLog, /Configure device Licht 2/, 'device of the second gateway');
    await waitFor(() => hbLog, /Configure device B.ro kl/, 'devices of the first gateway');
    check(/Gateway 127\.0\.0\.2 is configured twice/.test(hbLog), 'the same gateway twice: second entry ignored');
    check((hbLog.match(/Configure device Licht\n/g) ?? []).length === 1, 'device reported by both gateways is created once');
    check(/Device Licht is reported by several gateways/.test(hbLog), 'duplicate is logged (debug)');

    const headers = { 'Authorization': PIN, 'Content-Type': 'application/json' };
    const base = 'http://127.0.0.1:' + HAP_PORT;
    let accessories;
    for (let i = 0; i < 20 && !accessories; i++) {
        accessories = await fetch(base + '/accessories', { headers }).then((r) => r.ok ? r.json() : undefined).catch(() => undefined);
        if (!accessories) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    const findOn = (name) => {
        for (const acc of accessories.accessories) {
            const characteristics = acc.services.flatMap((service) => service.characteristics);
            const on = characteristics.find((c) => c.description === 'On');
            if (characteristics.find((c) => c.description === 'Name')?.value === name && on) {
                return { aid: acc.aid, iid: on.iid };
            }
        }
        return undefined;
    };
    const put = (characteristics) => fetch(base + '/characteristics', { method: 'PUT', headers, body: JSON.stringify({ characteristics }) });

    await put([{ ...findOn('Licht 2'), value: true }]);
    await waitFor(() => gatewayLog, /POST \/exec\/apply .*io:\/\/2222-3333-4444\/333.* @127\.0\.0\.2/, 'command for Licht 2');
    pass('command for a device of the second gateway goes to the second gateway');
    await put([{ ...findOn('Licht'), value: true }]);
    await waitFor(() => gatewayLog, /POST \/exec\/apply .*io:\/\/1234-5678-9012\/222[^@\n]*\n/, 'command for Licht');
    pass('command for a device of the first gateway goes to the first gateway');

    const problems = hbLog.split('\n').filter((line) => /Unhandled rejection|Uncaught exception|TypeError|ReferenceError|Safety stop/.test(line));
    check(problems.length === 0, 'no errors or safety stop in the log', problems.join('\n'));
    homebridge.removeAllListeners('exit');
    if (failed) {
        fail(failed + ' checks failed\n--- Homebridge log ---\n' + hbLog);
    } else {
        cleanup(0);
    }
} catch (error) {
    fail(error.message + '\n--- Homebridge log ---\n' + hbLog + '\n--- Gateway log ---\n' + gatewayLog);
}
