 
// Smoke test: start the installed Homebridge version with this plugin against a mock gateway,
// check that the devices are created and that a HomeKit command reaches the gateway.
// Run after `npm run build`: node test/smoke.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tahoma-local-smoke-'));
const PIN = '031-45-154';
const HAP_PORT = 51899;
const TIMEOUT = 60 * 1000;
const children = [];

function fail(message) {
    console.error('SMOKE TEST FAILED:', message);
    cleanup(1);
}

function cleanup(code) {
    children.forEach((child) => child.kill('SIGTERM'));
    setTimeout(() => process.exit(code), 500);
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

// Plugins must not load the homebridge package at runtime (only through the API object):
// otherwise they depend on where and in which version Homebridge is installed.
for (const file of fs.readdirSync(path.join(root, 'dist'), { recursive: true })) {
    if (String(file).endsWith('.js') && /from ['"]homebridge['"]|require\(['"]homebridge['"]\)/.test(fs.readFileSync(path.join(root, 'dist', String(file)), 'utf8'))) {
        fail('dist/' + file + ' imports the homebridge package at runtime');
    }
}

// Self-signed certificate for the mock gateway
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });

let gatewayLog = '';
const gateway = spawn(process.execPath, [path.join(root, 'test/mock-gateway.mjs'), path.join(tmp, 'key.pem'), path.join(tmp, 'cert.pem')]);
gateway.stdout.on('data', (d) => gatewayLog += d);
children.push(gateway);

// Homebridge storage with the plugin linked as @tplnet/homebridge-tahoma
const storage = path.join(tmp, 'storage');
const plugins = path.join(tmp, 'plugins', '@tplnet');
fs.mkdirSync(storage, { recursive: true });
fs.mkdirSync(plugins, { recursive: true });
fs.symlinkSync(root, path.join(plugins, 'homebridge-tahoma'));
fs.writeFileSync(path.join(storage, 'config.json'), JSON.stringify({
    bridge: { name: 'Smoke Test', username: '0E:11:22:33:44:99', port: HAP_PORT, pin: PIN },
    platforms: [{ platform: 'Tahoma', name: 'TaHoma', service: 'local', user: '127.0.0.1', password: 'testtoken', tlsInsecure: true, pollingPeriod: 1 }],
}));

let hbLog = '';
const homebridgeDir = process.env.HOMEBRIDGE_DIR || path.join(root, 'node_modules', 'homebridge');
const homebridgePkg = JSON.parse(fs.readFileSync(path.join(homebridgeDir, 'package.json'), 'utf8'));
const version = homebridgePkg.version;
const homebridgeBin = path.join(homebridgeDir, typeof homebridgePkg.bin === 'string' ? homebridgePkg.bin : homebridgePkg.bin.homebridge);
console.log('Homebridge ' + version + ' on Node.js ' + process.version);
const homebridge = spawn(process.execPath, [homebridgeBin, '-U', storage, '-P', path.join(tmp, 'plugins'), '-I', '--strict-plugin-resolution', '-Q']);
// eslint-disable-next-line no-control-regex
const plain = (d) => String(d).replace(/\x1b\[[0-9;]*m/g, '');
homebridge.stdout.on('data', (d) => hbLog += plain(d));
homebridge.stderr.on('data', (d) => hbLog += plain(d));
children.push(homebridge);
homebridge.on('exit', (code) => fail('Homebridge exited with code ' + code + '\n' + hbLog));

try {
    await waitFor(() => gatewayLog, /listening/, 'mock gateway');
    await waitFor(() => hbLog, /Configure device Licht/, 'device discovery');
    await waitFor(() => hbLog, /Configure device B.ro kl/, 'device discovery');

    // Find the On characteristic of "Licht" and switch it on through HAP
    const headers = { 'Authorization': PIN, 'Content-Type': 'application/json' };
    const base = 'http://127.0.0.1:' + HAP_PORT;
    let accessories;
    for (let i = 0; i < 20 && !accessories; i++) {
        accessories = await fetch(base + '/accessories', { headers }).then((r) => r.ok ? r.json() : undefined).catch(() => undefined);
        if (!accessories) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    if (!accessories) {
        throw new Error('HAP server not reachable');
    }
    const findCharacteristic = (data, accessoryName, description) => {
        for (const acc of data.accessories) {
            const characteristics = acc.services.flatMap((service) => service.characteristics);
            const found = characteristics.find((c) => c.description === description);
            if (characteristics.find((c) => c.description === 'Name')?.value === accessoryName && found) {
                return { aid: acc.aid, iid: found.iid };
            }
        }
        return undefined;
    };
    const put = async (characteristics) => {
        const response = await fetch(base + '/characteristics', { method: 'PUT', headers, body: JSON.stringify({ characteristics }) });
        if (!response.ok) {
            throw new Error('HAP PUT failed with ' + response.status);
        }
    };

    // Light: switch it on from Apple Home
    const light = findCharacteristic(accessories, 'Licht', 'On');
    if (!light) {
        throw new Error('accessory "Licht" with On characteristic not found');
    }
    await put([{ ...light, value: true }]);
    await waitFor(() => gatewayLog, /POST \/exec\/apply .*"name":"on"/, 'command at gateway');
    await waitFor(() => hbLog, /\[Licht\] on COMPLETED/, 'execution completed');

    // Roller shutter: move it from Apple Home, then change it outside Apple Home (remote control).
    // The change must show up right away: the device must not stay busy after the command completed.
    const shutter = findCharacteristic(accessories, 'Büro kl', 'Target Position');
    if (!shutter) {
        throw new Error('accessory "Büro kl" with Target Position not found');
    }
    await put([{ ...shutter, value: 30 }]);
    await waitFor(() => hbLog, /\[Büro kl\.\] setClosure COMPLETED/, 'shutter command completed');
    // Readable label in the TaHoma app history (English, also with the local API)
    await waitFor(() => gatewayLog, /"label":"Büro kl\. - Close 70% - Apple Home"/, 'readable command label');
    // The motor reports 71 % closed for 70 % (position 29 instead of 30): shown as the target, not as "Closing…"
    const current = findCharacteristic(accessories, 'Büro kl', 'Current Position');
    const read = async (c) => (await fetch(base + '/characteristics?id=' + c.aid + '.' + c.iid, { headers }).then((r) => r.json())).characteristics[0].value;
    let position;
    for (let i = 0; i < 10 && position !== 30; i++) {
        await new Promise((r) => setTimeout(r, 300));
        position = await read(current);
    }
    if (position !== 30) {
        throw new Error('position slightly off the target not shown as target (current position ' + position + ', expected 30)');
    }
    const gatewayRequest = (body) => new Promise((resolve, reject) => {
        const req = https.request('https://127.0.0.1:8443/enduser-mobile-web/1/enduserAPI/test/state', {
            method: 'POST', rejectUnauthorized: false,
            headers: { 'Authorization': 'Bearer testtoken', 'Content-Type': 'application/json' },
        }, (res) => {
            res.resume();
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.end(JSON.stringify(body));
    });
    await gatewayRequest({ deviceURL: 'io://1234-5678-9012/111', name: 'core:ClosureState', value: 10 });
    let target;
    for (let i = 0; i < 20 && target !== 90; i++) {
        await new Promise((r) => setTimeout(r, 500));
        target = await read(shutter);
    }
    if (target !== 90) {
        throw new Error('change made outside Apple Home not shown (target position ' + target + ', expected 90)');
    }
    if (/TIMED_OUT/.test(hbLog)) {
        throw new Error('execution reported TIMED_OUT');
    }

    const problems = hbLog.split('\n').filter((line) => /not supported|Unhandled rejection|Uncaught exception|TypeError|ReferenceError/.test(line));
    if (problems.length > 0) {
        throw new Error('unexpected log lines:\n' + problems.join('\n'));
    }
    console.log('Smoke test passed');
    homebridge.removeAllListeners('exit');
    cleanup(0);
} catch (error) {
    fail(error.message + '\n--- Homebridge log ---\n' + hbLog + '\n--- Gateway log ---\n' + gatewayLog);
}
