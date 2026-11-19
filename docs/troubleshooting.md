# Troubleshooting

[← Back to the README](../README.md)

| Message in the log | What to do |
|---|---|
| `Invalid gateway "…"` | With the local API, `user` must be the gateway PIN (`XXXX-XXXX-XXXX`) or its IPv4 address |
| `Gateway not found via mDNS …` | Check that Developer Mode is enabled and that Homebridge is in the same network as the gateway. Otherwise use the gateway's IP address as `user` (preferably with a fixed DHCP lease) |
| `Token rejected by the gateway (401)` | The token was revoked or mistyped – generate a new one in the TaHoma app |
| `TLS error …` | Set `"tlsInsecure": true` and please open an issue with the message |
| `Gateway not reachable (…) – it may be offline or restarting` | Logged once per outage; the plugin reconnects by itself and logs `Gateway reachable again` |
| `Somfy cloud login rejected … Next login attempt in …` | Wrong account e-mail or password (or a temporary problem of the Somfy cloud). The plugin waits before the next attempt (1 min, then longer) so that the account is not locked |
| `Somfy cloud rate limit reached` / `429 QUOTA_EXCEEDED` | Increase `refreshPeriod` (default 1440) or set it to `0` – or switch to the [local API](../README.md#local-api-recommended) |
| `The service '…' is not supported anymore` | Version 3 supports Somfy TaHoma only. For Cozytouch, Hi Kumo, Flexom or Energeasy install version 2.x (Homebridge UI → plugin → *Manage Version*) |
| Changes made with a remote are not shown | RTS devices cannot report their state at all. io devices normally report within seconds – see [Device state not updated](#device-state-not-updated-eg-garage-door) |
| Accessories disappeared after installing this plugin | Both plugins were installed at the same time – restore your backup and follow [Migrating](../README.md#migrating-from-homebridge-tahoma) |

For a detailed log, set `"debug": true` and restart Homebridge. For a single device, add `"debug": true` to its entry in `devicesConfig` – the log then also shows the commands and states the gateway offers for it.

## Device state not updated (e.g. garage door)

io devices report their new state to the gateway after a movement. Sometimes this report gets lost (radio range, walls, metal doors) – then the TaHoma app shows the old state as well, and so does Apple Home. Opening the device in the TaHoma app asks it for its state and fixes it.

It also happens that the gateway knows the new state but does not send the change to the plugin. Then the next full refresh (`refreshPeriod`) corrects it – with the local API every 5 minutes by default; set a lower value (e.g. `2`) if you want it faster.

To see which commands and states the gateway offers for a device, add `"debug": true` to its entry in [`devicesConfig`](configuration.md#all-devices).

## Reporting a problem

Please open an issue at <https://github.com/tplnet/homebridge-tahoma/issues> with the Homebridge log (with `"debug": true`) and the device's UI class and widget name shown in the log at startup, e.g. `RollerShutter > PositionableRollerShutter`.
