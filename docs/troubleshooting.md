# Troubleshooting

[← Back to the README](../README.md)

| Problem | What to do |
|---|---|
| `No gateway found on your network` | Check that Developer Mode is enabled and that Homebridge is in the same network as the gateway. Otherwise use the gateway's IP address as `user` |
| Certificate error with the local API | Set `"tlsInsecure": true` and please open an issue with the error message |
| `401` with the local API | The token was revoked or mistyped – generate a new one in the TaHoma app |
| `429 QUOTA_EXCEEDED` (cloud) | Increase `refreshPeriod` (default 1440) or set it to `0` – or switch to the [local API](../README.md#local-api-recommended) |
| Changes made with a remote are not shown | RTS devices cannot report their state at all. io devices normally report within seconds; if the TaHoma app shows the old state too, the gateway missed the report – it is updated with the next report or when the device is opened in the TaHoma app |
| Accessories disappeared after installing this plugin | Both plugins were installed at the same time – restore your backup and follow [Migrating](../README.md#migrating-from-homebridge-tahoma) |

For a detailed log, set `"debug": true` and restart Homebridge. For a single device, add `"debug": true` to its entry in `devicesConfig` – the log then also shows the commands and states the gateway offers for it.

## Device state not updated (e.g. garage door)

io devices report their new state to the gateway after a movement. Sometimes this report gets lost (radio range, walls, metal doors) – then the TaHoma app shows the old state as well, and so does Apple Home. Opening the device in the TaHoma app asks it for its state and fixes it.

It also happens that the gateway knows the new state but does not send the change to the plugin. Then the next full refresh (`refreshPeriod`) corrects it – with the local API every 5 minutes by default; set a lower value (e.g. `2`) if you want it faster.

To see which commands and states the gateway offers for a device, add `"debug": true` to its entry in [`devicesConfig`](configuration.md#all-devices).

## Reporting a problem

Please open an issue at <https://github.com/tplnet/homebridge-tahoma/issues> with the Homebridge log (with `"debug": true`) and the device's UI class and widget name shown in the log at startup, e.g. `RollerShutter > PositionableRollerShutter`.
