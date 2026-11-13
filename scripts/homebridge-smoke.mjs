#!/usr/bin/env node
/**
 * Smoke test: starts the Homebridge version installed in node_modules with this plugin and checks
 * that the plugin loads, is accepted as compatible and initialises its platform.
 *
 * Used by the scheduled "Compatibility & CVE check" workflow against homebridge@latest (and beta).
 * The platform points to an unreachable local gateway: a connection error is expected and fine,
 * the test is about loading the plugin, not about talking to a TaHoma box.
 *
 * Usage: npm run build && node scripts/homebridge-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const homebridgePkg = JSON.parse(readFileSync(join(root, 'node_modules/homebridge/package.json'), 'utf8'));
const DURATION_MS = 20_000;

const storage = mkdtempSync(join(tmpdir(), 'hb-smoke-'));
const plugins = join(storage, 'plugins');
const [scope, name] = pkg.name.split('/');
mkdirSync(join(plugins, scope), { recursive: true });
symlinkSync(root, join(plugins, scope, name), 'dir');
writeFileSync(join(storage, 'config.json'), JSON.stringify({
    bridge: { name: 'Smoke Test', username: '0E:00:00:00:00:01', port: 51999, pin: '031-45-154' },
    platforms: [{ platform: 'Tahoma', name: 'Tahoma', service: 'local', user: '127.0.0.1', password: 'smoke-test' }],
}, null, 2));

console.log(`Homebridge ${homebridgePkg.version} / Node.js ${process.version} / ${pkg.name} ${pkg.version}`);

const child = spawn(process.execPath,
    [join(root, 'node_modules/homebridge/bin/homebridge'), '-I', '-Q', '-U', storage, '-P', plugins, '--strict-plugin-resolution'],
    { cwd: root, env: { ...process.env, FORCE_COLOR: '0' } });
let output = '';
child.stdout.on('data', (data) => output += data);
child.stderr.on('data', (data) => output += data);
setTimeout(() => child.kill('SIGTERM'), DURATION_MS);

child.on('exit', () => {
    rmSync(storage, { recursive: true, force: true });
    // eslint-disable-next-line no-control-regex
    const log = output.replace(/\x1b\[[0-9;]*m/g, '');
    console.log(log);

    const checks = [
        ['plugin loaded', log.includes(`Loaded plugin: ${pkg.name}@${pkg.version}`)],
        ['platform initialised', log.includes('[Tahoma] Initializing Tahoma platform')],
        ['Homebridge version accepted (engines.homebridge)', !log.includes('requires a Homebridge version')],
        ['Node.js version accepted (engines.node)', !log.includes('requires a Node.js version')],
        ['no plugin load error', !/Error loading plugin|Failed to load plugin|does not export an initializer/i.test(log)],
        ['no uncaught exception / unhandled rejection', !/Uncaught exception|Unhandled rejection|TypeError|ReferenceError/i.test(log)],
    ];
    let failed = 0;
    for (const [label, ok] of checks) {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
        failed += ok ? 0 : 1;
    }
    process.exit(failed ? 1 : 0);
});
