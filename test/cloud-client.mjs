// Test of the Somfy cloud client against a simulated cloud: login (form data, session cookie), requests with the
// cookie, re-login once after an expired session, no re-login on 429 (rate limit), paused login after a rejected password.
// Usage: npm run build && node test/cloud-client.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tahoma-cloud-test-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'key.pem'),
    '-out', path.join(tmp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = '/enduser-mobile-web/enduserAPI';
let logins = 0;
let sessionValid = true;
let expireNext = false;
const server = https.createServer({ key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem')) },
    (req, res) => {
        let body = '';
        req.on('data', (c) => body += c);
        req.on('end', () => {
            const json = (status, data, headers = {}) => {
                res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data));
            };
            if (req.url === BASE + '/login' && req.method === 'POST') {
                const form = new URLSearchParams(body);
                if (req.headers['content-type'] !== 'application/x-www-form-urlencoded' || form.get('userId') !== 'me@example.com') {
                    return json(400, { error: 'bad request' });
                }
                if (form.get('userPassword') !== 'secret') {
                    return json(401, { errorCode: 'AUTHENTICATION_ERROR', error: 'Bad credentials' });
                }
                logins++; sessionValid = true;
                return json(200, { success: true }, { 'Set-Cookie': 'JSESSIONID=abc' + logins + '; Path=/; Secure' });
            }
            if (req.headers.cookie !== 'JSESSIONID=abc' + logins || !sessionValid) {
                return json(401, { errorCode: 'RESOURCE_ACCESS_DENIED', error: 'Not authenticated' });
            }
            if (req.url === BASE + '/events/register') return json(200, { id: 'l1' });
            if (req.url === BASE + '/events/l1/fetch') return json(200, []);
            if (expireNext) {
                expireNext = false; sessionValid = false;
                return json(401, { errorCode: 'RESOURCE_ACCESS_DENIED', error: 'Not authenticated' });
            }
            if (req.url === BASE + '/actionGroups') return json(200, [{ oid: 'ag1', label: 'Close all', actions: [] }]);
            if (req.url === BASE + '/setup/devices/states/refresh') return json(429, { errorCode: 'QUOTA_EXCEEDED', error: 'Too many requests' });
            return json(404, { error: 'not found' });
        });
    });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const { CLOUD_HOSTS } = await import(path.join(root, 'dist/overkiz/CloudApiClient.js'));
const { default: Client } = await import(path.join(root, 'dist/overkiz/Client.js'));
CLOUD_HOSTS.somfy_europe = '127.0.0.1:' + port;
const logs = [];
const log = { debug: () => {}, info: (...a) => logs.push('INFO ' + a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')),
    error: (...a) => logs.push('ERROR ' + a.join(' ')) };

let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); failed += ok ? 0 : 1; };

const client = new Client(log, { service: 'somfy_europe', user: 'me@example.com', password: 'secret', refreshPeriod: 0 });
const groups = await client.getActionGroups();
check('login with form data, request with session cookie', groups[0]?.label === 'Close all' && logins === 1);

expireNext = true;
const again = await client.getActionGroups();
check('expired session: logged in again once, request repeated', again[0]?.oid === 'ag1' && logins === 2);

// Two requests at the same time on an expired session: still only one new login
expireNext = true;
await Promise.all([client.getActionGroups(), client.getActionGroups()]);
check('parallel requests on an expired session: only one new login', logins === 3);

await client.refreshAllStates();
check('429: reported as rate limit, no new login', logins === 3 && logs.some((l) => l.startsWith('WARN') && l.includes('rate limit')));

const bad = new Client(log, { service: 'somfy_europe', user: 'me@example.com', password: 'wrong', refreshPeriod: 0 });
const first = await bad.getActionGroups().then(() => 'ok', (e) => String(e));
const second = await bad.getActionGroups().then(() => 'ok', (e) => String(e));
check('wrong password: login rejected, next attempt paused', first.includes('401') && second.includes('Login paused')
    && logs.some((l) => l.startsWith('ERROR') && l.includes('login rejected')));

check('local API: scenarios empty, no cloud call', (await new Client(log, { service: 'local', user: '127.0.0.1', password: 't',
    refreshPeriod: 0 }).getActionGroups()).length === 0);

client.removeAllListeners();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
