# Homebridge Somfy TaHoma (tplnet)

[![npm](https://img.shields.io/npm/v/@tplnet/homebridge-tahoma)](https://www.npmjs.com/package/@tplnet/homebridge-tahoma)
[![CI](https://github.com/tplnet/homebridge-tahoma/actions/workflows/ci.yml/badge.svg)](https://github.com/tplnet/homebridge-tahoma/actions/workflows/ci.yml)
[![Compatibility & CVE check](https://github.com/tplnet/homebridge-tahoma/actions/workflows/compat.yml/badge.svg)](https://github.com/tplnet/homebridge-tahoma/actions/workflows/compat.yml)
[![License](https://img.shields.io/npm/l/@tplnet/homebridge-tahoma)](LICENSE)

Package: [`@tplnet/homebridge-tahoma`](https://www.npmjs.com/package/@tplnet/homebridge-tahoma)

Control your **Somfy TaHoma** devices – roller shutters, blinds, awnings, gates, garage doors, lights, heating, alarms, sensors – with **Apple Home** and Siri, through [Homebridge](https://homebridge.io).

Works with all **Overkiz** based platforms: Somfy TaHoma / TaHoma Switch / Connexoon, Atlantic / Thermor / Sauter **Cozytouch**, Hitachi Hi Kumo, Flexom and Rexel Energeasy – via the **local API** of your TaHoma gateway or via the manufacturer's cloud.

> This is a maintained fork of [dubocr/homebridge-tahoma](https://github.com/dubocr/homebridge-tahoma) by Romain Duboc, using the forked API client [`@tplnet/overkiz-client`](https://github.com/tplnet/overkiz-client).
> It is a **drop-in replacement**: the platform name stays `Tahoma`, so your configuration and your accessories in Apple Home are kept – see [Migrating](#migrating-from-homebridge-tahoma).
> Changes compared to the original: [CHANGELOG.md](CHANGELOG.md).

> **Note:** Private hobby project, developed in spare time with the help of AI tools. Use at your own risk; support is best effort. See the [disclaimer](#disclaimer).

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Migrating from homebridge-tahoma](#migrating-from-homebridge-tahoma)
- [Configuration](#configuration)
- [Local API (recommended)](#local-api-recommended)
- [Device specific configuration](#device-specific-configuration)
- [Supported devices](#supported-devices)
- [Troubleshooting](#troubleshooting)
- [Compatibility and security](#compatibility-and-security)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [Releasing (maintainers)](#releasing-maintainers)
- [Disclaimer](#disclaimer)
- [License and credits](#license-and-credits)

## Requirements

- Homebridge 1.8 or 2.x (tested with Homebridge 2.5)
- Node.js 22, 24 or 26
- One of the supported services:

| `service` | Vendor | Products |
|---|---|---|
| `local` | Somfy local API | TaHoma, TaHoma Switch – [set up the local API](#local-api-recommended) |
| `somfy_europe` | Somfy Europe | TaHoma, TaHoma Switch, Connexoon IO, Orange connectivity kit |
| `somfy_australia` | Somfy Australia | Connexoon RTS and other products in Australia |
| `somfy_north_america` | Somfy North America | TaHoma and other products in North America |
| `cozytouch` | Atlantic, Thermor, Sauter | Cozytouch |
| `flexom` | Bouygues | Flexom |
| `hi_kumo` | Hitachi | Hi Kumo |
| `rexel` | Rexel | Energeasy Connect |

## Installation

**Homebridge UI (recommended):** open *Plugins*, search for `@tplnet/homebridge-tahoma`, install it and fill in the settings form.

**Command line:**

```sh
npm install -g @tplnet/homebridge-tahoma
```

Then add the platform to your `config.json` (see [Configuration](#configuration)) and restart Homebridge.

## Migrating from homebridge-tahoma

> **Important:** never have both plugins installed at the same time. Homebridge only hands the cached accessories over to the new plugin if exactly one plugin provides the `Tahoma` platform. With both installed it removes them as orphaned – and Apple Home loses the rooms, scenes and automations of these accessories.

1. Back up Homebridge (Homebridge UI → *Settings* → *Backup*).
2. **First** uninstall `homebridge-tahoma`, **then** install `@tplnet/homebridge-tahoma`.
3. Keep your existing `Tahoma` platform block in `config.json` unchanged (same `service`, same credentials – switching between cloud and local API changes the device identifiers).
4. Restart Homebridge. For each accessory the log shows *"it seems like the plugin name changed from 'homebridge-tahoma' to '@tplnet/homebridge-tahoma'"* – the accessories have been taken over.

## Configuration

### Local API (recommended)

```json
{
    "platforms": [
        {
            "platform": "Tahoma",
            "name": "TaHoma",
            "service": "local",
            "user": "2001-1234-5678",
            "password": "YOUR-LOCAL-API-TOKEN"
        }
    ]
}
```

`user` is the gateway PIN (or its IPv4 address), `password` the token from the TaHoma app – see [Local API](#local-api-recommended).

### Cloud

```json
{
    "platforms": [
        {
            "platform": "Tahoma",
            "name": "TaHoma",
            "service": "somfy_europe",
            "user": "user@example.com",
            "password": "MyPassw0rd"
        }
    ]
}
```

### All options

| Option | Type | Default | Description |
|---|---|---|---|
| `service` | string | `somfy_europe` | Service, see [Requirements](#requirements) |
| `user` | string | – | **Required.** Local: gateway PIN or IPv4 address. Cloud: account e-mail |
| `password` | string | – | **Required.** Local: API token. Cloud: account password |
| `pollingPeriod` | number (s) | `5` local / `60` cloud | How often changes made elsewhere (remote, TaHoma app) are fetched. Cloud: at least 10 |
| `refreshPeriod` | number (min) | `30` local / `1440` cloud | Periodic full state refresh, needed for RTS devices and physical remotes that do not report their state. `0` disables it. The Somfy cloud allows only one refresh per day – lower values cause `429 QUOTA_EXCEEDED` |
| `tlsInsecure` | boolean | `false` | Local API only: skip the gateway certificate check (by default verified against the [Overkiz root CA](https://ca.overkiz.com/overkiz-root-ca-2048.crt)). Use only if the connection fails with a certificate error |
| `exclude` | string[] | `[]` | Devices to hide: device name, widget, UI class or protocol (e.g. `"rts"`, `"Main door"`, `"PositionableHorizontalAwning"`) |
| `exposeScenarios` | boolean / string[] | `false` | Cloud only: expose TaHoma scenarios as switches in Apple Home; `true` for all or a list of scenario names |
| `devicesConfig` | object[] | `[]` | Per-device settings, see [below](#device-specific-configuration) |
| `debug` | boolean | `false` | Verbose log output |

## Local API (recommended)

The local API talks directly to your gateway in your home network: no cloud account in Homebridge, no internet dependency, no rate limits and state changes within seconds.

**Supported:** TaHoma and TaHoma Switch. **Not supported:** the 1st generation square TaHoma box and the Connectivity Kit.

1. Open the **TaHoma by Somfy** app.
2. Go to *Configure the installation* → *Access the parameters* of your gateway.
3. Tap the gateway PIN (e.g. `2001-1234-5678`) **7 times** quickly to enable *Developer Mode*.
4. Accept the terms and **generate a token**. Copy it right away – it is only shown once.
5. Configure the plugin with `"service": "local"`, the PIN as `user` and the token as `password`.

The gateway is found in your network by its PIN (mDNS). If Homebridge runs in another network or VLAN, use the gateway's IP address as `user` (preferably with a fixed DHCP lease).

> **Note:** cloud and local API use different device identifiers. Switching an existing setup from cloud to local makes Apple Home see all accessories as new ones – rooms and automations have to be set up again.

More information: [Somfy TaHoma Developer Mode](https://github.com/Somfy-Developer/Somfy-TaHoma-Developer-Mode).

## Device specific configuration

`devicesConfig` applies settings to a single device or a group of devices. Each entry has a `key` – a device name, widget, UI class, protocol or unique identifier – and the settings for that device type:

```json
"devicesConfig": [
    { "key": "Bedroom blind", "blindMode": true },
    { "key": "UpDownRollerShutter", "defaultPosition": 50 },
    { "key": "GarageDoor", "reverse": true },
    { "key": "Alarm", "stayZones": "A,C" }
]
```

### Roller shutters, blinds, awnings (WindowCovering)

| Setting | Type | Default | Description |
|---|---|---|---|
| `defaultPosition` | number | `0` | Final position shown for up/down-only (stateless) shutters after a command |
| `reverse` | boolean | `false` | Swap up and down (e.g. after a wrong installation) |
| `lowSpeed` | boolean / string | `false` | Use the low (silent) speed on shutters that support it. As string `"HH:MM-HH:MM"`, low speed is used only in that time slot (may span midnight, e.g. `"22:00-07:00"`) |
| `blindMode` | boolean | `false` | Main slider controls the slats: 100 % fully opens, 0 % fully closes, 1–99 % closes the blind and tilts the slats (99 % = horizontal, most light; 1 % = nearly closed) |
| `blindsOnRollerShutter` | boolean | `false` | Blinds mounted on roller shutter motors: keep the slats horizontal (open) at intermediate positions |
| `movementDuration` | number (s) | `0` | Duration of a full movement from open to closed; used to estimate intermediate positions (`0` = off) |

### Garage doors and gates (GarageDoorOpener)

| Setting | Type | Default | Description |
|---|---|---|---|
| `cyclic` | boolean | `false` | For stateless devices that close by themselves: show *closed* again after `cycleDuration` |
| `cycleDuration` | number (s) | `5` | Cycle duration for `cyclic` |
| `reverse` | boolean | `false` | Swap open and close |
| `pedestrianDuration` | number (s) | `0` | Duration of the pedestrian opening for RTS gates |

### Alarm

| Setting | Type | Default | Description |
|---|---|---|---|
| `stayZones` | string | `A` | Zones (A, B, C) armed in *Stay* mode |
| `nightZones` | string | `B` | Zones (A, B, C) armed in *Night* mode |
| `occupancySensor` | boolean | `false` | Add an occupancy sensor linked to the alarm |

### Heating

| Setting | Type | Default | Description |
|---|---|---|---|
| `derogationDuration` | number (h) | `1` | Duration of temporary (derogation) orders |
| `comfort` | number (°C) | `19` | Comfort temperature shown for pilot wire heaters |
| `eco` | number (°C) | `17` | Eco temperature shown for pilot wire heaters |

## Supported devices

Roller shutters, exterior and interior venetian blinds, adjustable slats, awnings, pergolas, screens, curtains, swinging shutters, windows and window handles, garage doors and gates, door locks, lights and on/off switches, sirens and alarms, heating systems (Atlantic, Somfy thermostat, EvoHome, Hitachi), water heaters, ventilation, and sensors for temperature, humidity, light, air quality, smoke, water, rain, contact, occupancy and electricity consumption.

A device type that is not supported shows up in the log as *"… not supported"*. Please [open an issue](https://github.com/tplnet/homebridge-tahoma/issues) with that log line and the device's widget name.

## Troubleshooting

| Problem | What to do |
|---|---|
| `No gateway found on your network` | Check that Developer Mode is enabled and that Homebridge is in the same network as the gateway. Otherwise use the gateway's IP address as `user` |
| Certificate error with the local API | Set `"tlsInsecure": true` and please open an issue with the error message |
| `401` with the local API | The token was revoked or mistyped – generate a new one in the TaHoma app |
| `429 QUOTA_EXCEEDED` (cloud) | Increase `refreshPeriod` (default 1440) or set it to `0` – or switch to the [local API](#local-api-recommended) |
| Changes made with a remote are not shown | RTS devices cannot report their state; keep `refreshPeriod` enabled |
| Accessories disappeared after installing this plugin | Both plugins were installed at the same time – restore your backup and follow [Migrating](#migrating-from-homebridge-tahoma) |

For a detailed log, set `"debug": true` and restart Homebridge.

## Compatibility and security

This plugin is kept compatible with the **newest Homebridge release** and free of **known vulnerabilities (CVEs)**:

- **Weekly and on every dependency change** the [Compatibility & CVE check](https://github.com/tplnet/homebridge-tahoma/actions/workflows/compat.yml) workflow
  - runs `npm audit` – any known vulnerability in the runtime dependencies fails the check,
  - builds the plugin and starts it with **homebridge@latest** and **homebridge@beta** on Node.js 22, 24 and 26 (`npm run smoke`): the plugin must load, be accepted as compatible (`engines`) and initialise without errors.
- **Every release** runs the same CVE and Homebridge checks before the version is staged on npm – a release with a known vulnerability or an incompatibility is not published.
- **Dependabot** opens weekly pull requests for dependency and GitHub Actions updates. Each of them runs CI and the full compatibility & CVE check (Homebridge latest/beta, Node.js 22/24/26) – when all checks are green, the update can simply be merged.

Found a security issue? Please report it privately via GitHub (*Security* → *Report a vulnerability*) instead of a public issue.

## Privacy

This plugin collects **no data about you** and contains **no telemetry, analytics or tracking**. It does not connect to the author or any other third party.

Network connections depend on the selected `service`:

| Service | Connections |
|---|---|
| `local` | Only to **your TaHoma gateway in your home network** (HTTPS, port 8443), plus an mDNS lookup in the local network when the gateway is configured by its PIN. **Nothing leaves your network.** |
| Cloud services | Only to the servers of the selected service, e.g. `ha101-1.overkiz.com` for Somfy Europe; Cozytouch additionally uses `apis.groupe-atlantic.com` to log in. |
| `proxy` option | All requests go to the proxy you configure – only if you set it. |

What is stored or sent:

- **Credentials** (gateway PIN/IP and token, or account e-mail and password) are kept in Homebridge's `config.json`, like for every Homebridge plugin. The plugin does not store them anywhere else and never writes the token or password to the log.
- **Accessory cache**: Homebridge stores device names and IDs in its accessory cache.
- **Log**: operational messages (commands, states, errors) go to the Homebridge log; with `"debug": true` also the requested gateway paths.
- **Command label**: each command carries a label made of the device name, the command and *"Apple Home"*, shown in the history of the TaHoma app. With the local API it stays on your gateway; with a cloud service it is sent to that service.

The package has no install scripts, and its runtime dependencies do not send data anywhere either.

## Contributing

Bug reports, device support requests and pull requests are welcome: <https://github.com/tplnet/homebridge-tahoma/issues>.
Please include the Homebridge log (with `"debug": true`) and the device's UI class and widget name shown in the log at startup.

## Releasing (maintainers)

```sh
npm audit --omit=dev                                      # must report 0 vulnerabilities
npm install --no-save homebridge@latest && npm run build && npm run smoke   # newest Homebridge
npm version patch   # or minor / major – bumps package.json and creates the annotated tag vX.Y.Z
git push --follow-tags
```

The `Publish to npm` workflow **stages** the version on npm via Trusted Publishing (stage-only permission) and creates a GitHub release.
The version becomes public only after approval with 2FA/passkey: npmjs.com → package → *Staged Packages*, or `npm stage approve <stage-id>`
(the id is shown in the workflow run summary and by `npm stage list <package>`).

Release notes: before tagging, describe the changes in a `## X.Y.Z` section at the top of `CHANGELOG.md`. `npm version` refuses to run without it, and the workflow uses this section as the description of the GitHub release (and stops before publishing if it is missing). Start each entry with what changes for the user, technical details after it; with several entries, group them under `### Added`, `### Changed`, `### Fixed` and `### Security`. The release also lists what was checked before it went out (newest Homebridge release, no known vulnerabilities, tested Node.js versions). Pre-release versions (e.g. `1.4.0-beta.1`) are published under the npm tag `next` and marked as pre-release on GitHub. Existing releases can be (re)filled with *Actions* → *Release notes* → *Run workflow* (tag or `all`); the checks written by the publish run are kept.

## Disclaimer

This is a private development project. It exists to keep the plugin compatible with current Homebridge releases, to apply security updates, to add features and to fix bugs.

- It is developed in spare time and with the help of AI tools. Every change goes through the automated checks described under [Compatibility and security](#compatibility-and-security) and is tested with real devices where possible, but mistakes can still happen.
- **Use at your own risk.** The plugin is provided as is, without any warranty (see the [Apache License 2.0](LICENSE)).
- Questions, bug reports and feature requests are welcome and are handled on a best-effort basis. There is no guaranteed response time and no guarantee that a request will be implemented.
- This project is not affiliated with or endorsed by Somfy, Overkiz, Apple or the Homebridge project. All product names are trademarks of their respective owners.

## License and credits

[Apache License 2.0](LICENSE). Original work © Romain Duboc and contributors – thank you for creating and maintaining this plugin for years. Modifications © 2026 tplnet, see [NOTICE](NOTICE).
