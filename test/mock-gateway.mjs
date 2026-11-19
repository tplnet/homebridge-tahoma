import https from 'https';
import fs from 'fs';
const TOKEN = 'testtoken';
const base = '/enduser-mobile-web/1/enduserAPI';
const devices = [
  { deviceURL: 'io://1234-5678-9012/111', oid: '', label: 'Büro kl.', controllableName: 'io:RollerShutterGenericIOComponent',
    definition: { type: 'ACTUATOR', uiClass: 'RollerShutter', widgetName: 'PositionableRollerShutter',
      commands: [{commandName:'setClosure',nparams:1},{commandName:'open',nparams:0},{commandName:'close',nparams:0},{commandName:'stop',nparams:0}] },
    states: [{ name: 'core:ClosureState', type: 1, value: 0 }, { name: 'core:OpenClosedState', type: 3, value: 'open' }] },
  { deviceURL: 'io://1234-5678-9012/222', label: 'Licht', controllableName: 'io:OnOffIOComponent',
    definition: { type: 'ACTUATOR', uiClass: 'OnOff', widgetName: 'StatefulOnOff', commands: [{commandName:'on',nparams:0},{commandName:'off',nparams:0}] },
    states: [{ name: 'core:OnOffState', type: 3, value: 'off' }] },
  { deviceURL: 'internal://1234-5678-9012/pod/0', label: 'Box', controllableName: 'internal:PodV3Component',
    definition: { type: 'PROTOCOL_GATEWAY', uiClass: 'Pod', widgetName: 'Pod', commands: [] }, states: [] },
];
let events = []; let execN = 0; let listenerExpired = false;
// Minimal stand-in for the local API of a TaHoma gateway (used by test/smoke.mjs).
// Usage: node mock-gateway.mjs <key.pem> <cert.pem> [port]
const [keyFile, certFile, port = '8443'] = process.argv.slice(2);
const log = (...a) => process.stdout.write(a.join(' ') + '\n');
https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, (req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const url = req.url.replace(base, '');
    if (!url.endsWith('/fetch')) {
      log(req.method, url, body);
    }
    const send = (code, obj) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { error: 'Not authenticated', errorCode: 'RESOURCE_ACCESS_DENIED' });
    if (url === '/apiVersion') return send(200, { protocolVersion: '2026.1.4-1' });
    if (url === '/setup/devices') return send(200, devices);
    if (url === '/events/register') return send(200, { id: 'listener-1' });
    if (url === '/test/expire-listener' && req.method === 'POST') {
      // Test hook: simulate a gateway restart (event listeners are gone)
      listenerExpired = true;
      return send(200, {});
    }
    if (url === '/events/listener-1/fetch' && listenerExpired) {
      listenerExpired = false;
      return send(400, { error: 'No registered event listener', errorCode: 'UNSPECIFIED_ERROR' });
    }
    if (url === '/events/listener-1/fetch') { const e = events; events = []; return send(200, e); }
    const m = url.match(/^\/setup\/devices\/(.+)\/states$/);
    if (m) { const d = devices.find(d => d.deviceURL === decodeURIComponent(m[1])); return d ? send(200, d.states) : send(404, {}); }
    if (url === '/test/state' && req.method === 'POST') {
      // Test hook: simulate a change made outside Apple Home (remote control, TaHoma app)
      const { deviceURL, name, value } = JSON.parse(body);
      const state = devices.find(d => d.deviceURL === deviceURL)?.states.find(s => s.name === name);
      if (state) {
        state.value = value;
      }
      events.push({ name: 'DeviceStateChangedEvent', deviceURL, deviceStates: [{ name, type: 1, value }] });
      return send(200, {});
    }
    if (url === '/exec/apply' && req.method === 'POST') {
      const exec = JSON.parse(body); const execId = 'exec-' + (++execN);
      setTimeout(() => {
        events.push({ name: 'ExecutionStateChangedEvent', execId, newState: 'IN_PROGRESS', timeToNextState: 1 });
        for (const a of exec.actions) for (const c of a.commands) {
          const d = devices.find(d => d.deviceURL === a.deviceURL);
          if (c.name === 'setClosure') {
            // Like many Somfy motors: the end position is reported slightly off (+1 %)
            const reported = Math.min(100, c.parameters[0] + 1);
            d.states[0].value = reported;
            events.push({ name: 'DeviceStateChangedEvent', deviceURL: a.deviceURL, deviceStates: [{ name: 'core:ClosureState', type: 1, value: reported }] });
          }
          if (c.name === 'on' || c.name === 'off') { d.states[0].value = c.name;
            events.push({ name: 'DeviceStateChangedEvent', deviceURL: a.deviceURL, deviceStates: [{ name: 'core:OnOffState', type: 3, value: c.name }] }); }
        }
        // Like the local API: the terminal state does not come with timeToNextState -1
        events.push({ name: 'ExecutionStateChangedEvent', execId, newState: 'COMPLETED', timeToNextState: 0 });
      }, 500);
      return send(200, { execId });
    }
    send(404, { error: 'not found' });
  });
}).listen(Number(port), () => log('listening'));
