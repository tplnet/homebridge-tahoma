## 3.0.2 (2026-11-23)

No change in Apple Home or in the settings form. README and package description: the plugin is now an independent project based on dubocr/homebridge-tahoma (credits and license unchanged).

## 3.0.1 (2026-11-23)

No change in Apple Home or in the settings form – preparation for the "Verified by Homebridge" check.

### Changed

- Settings schema: required fields (name, service, user, password) are listed at object level as JSON Schema expects, instead of `"required": true` on each field
- `package.json` keyword `supports-hap`: the plugin publishes its accessories via HAP (Apple Home)
- Security policy: vulnerabilities in the built-in API client are reported in this repository; `@tplnet/overkiz-client` and `homebridge-tahoma-local` are archived

## 3.0.0 (2026-11-23)

Version 3 concentrates on **Somfy TaHoma** – the only system the maintainer can test – and brings the API client into the plugin. Your accessories keep their IDs: rooms, scenes and automations in Apple Home stay as they are (checked with a real installation of 24 accessories). Tested as 3.0.0-beta.2, see the beta sections below for all details.

### Changed

- **Somfy TaHoma only:** local API and Somfy cloud (Europe, Australia, North America). Atlantic / Thermor / Sauter Cozytouch, Hitachi Hi Kumo, Flexom and Rexel Energeasy are no longer supported – stay on version 2.x for them. With one of these services the plugin logs an error and does nothing, so the accessories are kept for a downgrade
- **API client built in:** `@tplnet/overkiz-client` is no longer needed; 4 instead of about 50 runtime packages
- Clearer log messages: wrong token, TLS problems, gateway or Somfy cloud not reachable – an outage is logged once as a warning (details only in the debug log) and the recovery once as info; rejected cloud login with the time of the next attempt
- Readable command labels also with the local API (e.g. "Bad - Close 100% - Apple Home"), always English
- `gateway` and `token` are accepted as aliases for `user` and `password` (local API)
- README: short explanation of what Homebridge is

### Added

- **Safety stops for your accessories:** nothing is created or removed if no cached accessory matches a device of the gateway, and accessories are kept if more than half would disappear at once
- Tests with a simulated gateway (commands, position tolerance, outage and recovery) and a simulated Somfy cloud (login, expired session, rate limit), and a test that accessory IDs are identical to version 2

### Fixed

- Somfy cloud: several requests hitting an expired session at the same time caused several logins – now only one
- Errors reported to Apple Home use the proper HAP status

### Removed

- Hitachi heat pumps (Hi Kumo) and Honeywell evohome device types, the undocumented `proxy` option, French command labels and the setup location request (cloud)

## 3.0.0-beta.2 (2026-11-23)

### Fixed

- Accessory IDs: the check whether a device ID of the gateway is already a UUID is now exactly the one of version 2. For an ID that only looks like a UUID, beta.1 would have calculated a different accessory ID. A new test compares the IDs with version 2 (210 cases)

### Added

- **Safety stop for your accessories:** if none of the cached accessories matches a device of the gateway (e.g. after a switch between Somfy cloud and local API), the plugin creates and removes nothing and logs what to do – rooms, scenes and automations in Apple Home stay as they are
- If more than half of the accessories would disappear at once, they are kept and listed in the log instead of being removed. Single devices removed in the TaHoma app are still removed (with a log line naming them)

## 3.0.0-beta.1 (2026-11-19)

### Changed

- **Somfy TaHoma only:** version 3 supports the local API and the Somfy cloud (Europe, Australia, North America). Atlantic / Thermor / Sauter Cozytouch, Hitachi Hi Kumo, Flexom and Rexel Energeasy are no longer supported – they could not be tested. With one of these services the plugin logs an error and does nothing, so the accessories stay cached for a downgrade to 2.x
- Settings form: only the Somfy services can be selected; README and package description updated

- **API client built in:** `@tplnet/overkiz-client` is no longer needed. The new client is based on the lean client of `homebridge-tahoma-local` (Node.js built-ins instead of axios, bonjour and uuid) plus the Somfy cloud: 4 instead of about 50 runtime packages. Accessory IDs are unchanged, your accessories, rooms and automations are kept
- Clearer messages: wrong token (401), TLS problems, gateway or Somfy cloud not reachable (logged once, recovery as well), rejected cloud login with the time of the next attempt. A missing or invalid gateway / password stops the plugin with a message instead of a crash
- Somfy cloud: when several requests hit an expired session at the same time, only one new login is made (before: one per request)
- `gateway` and `token` (names of `homebridge-tahoma-local`) are accepted as aliases for `user` and `password`
- Readable command labels also with the local API, e.g. "Bad - Close 100% - Apple Home" (before: "setClosure.100"); labels are always English. The TaHoma app shows them in its history only for commands sent through the Somfy cloud
- Errors reported to Apple Home use the proper HAP status (no generic error in the Home app)
- Troubleshooting page lists the new log messages and what to do

### Removed

- Device types that cannot be connected to a TaHoma gateway: Hitachi heat pumps (Hi Kumo) and Honeywell evohome
- The undocumented `proxy` option
- French command labels and the request for the setup location at startup (cloud): labels are English like the rest of the plugin

## 2.4.5 (2026-11-19)

### Changed

- **Announcement: from version 3.0.0 this plugin supports Somfy TaHoma only** (local API and Somfy cloud). Cozytouch (Atlantic / Thermor / Sauter), Hitachi Hi Kumo, Flexom and Rexel Energeasy keep working in 2.x, but are not tested – the maintainer can only test with a Somfy TaHoma gateway. The plugin logs a warning at startup for these services; the README and the settings form say so as well
- README: plugin icon at the top (also on npm and in the Homebridge UI)

## 2.4.4 (2026-11-19)

### Fixed

- Local API: a device whose change did not reach the plugin (e.g. a garage door closed with its remote, still shown as open in Apple Home) is corrected after at most 5 minutes instead of 30 – the full refresh now runs every 5 minutes by default. Requires `@tplnet/overkiz-client` ^1.3.4. A configured "Full refresh interval" is kept
- Settings form, README and troubleshooting page describe the new default and the case of a missed change

## 2.4.3 (2026-11-18)

### Changed

- Settings form: a note at the top explains the **+** button – one configuration per gateway or cloud account, another one only for a second gateway or account, each with its own name as a separate child bridge. Clearer descriptions for name, user / gateway and password / token
- Settings form, *Device specific config*: each entry is a collapsed line named after its device (new entries: "New entry – enter a device name"), the button says "Add device or type" instead of "Add devices config"; shorter help text per entry
- Settings form, hidden devices: button "Add device or scenario to hide"
- README: new section "Several gateways or accounts"

### Fixed

- Settings form: the example "Configure device <name>" in the descriptions was shown as "Configure device " (the name in angle brackets was swallowed as HTML)

## 2.4.2 (2026-11-18)

### Changed

- Settings form: the section "What" is now called *Devices and scenarios* and explains what it does. Hidden devices: description of which name or type to enter and where to find it, and that a hidden device is removed from Apple Home. Scenarios: noted that they only work with a cloud service
- Settings form, *Advanced settings*: clearer names and descriptions (update interval, full refresh interval, certificate check); the global debug log can now be switched on here
- README: options and troubleshooting described accordingly; the full refresh does not help for devices without feedback (RTS) – the old text suggested it

### Fixed

- Hiding a device or scenario now also works with the name shown in Apple Home and in the log, not only with the name from the TaHoma app
- `exposeScenarios` with a list of scenario names now exposes only these scenarios, as documented (before, all scenarios were exposed)

## 2.4.1 (2026-11-17)

### Changed

- Settings form, *Device specific config*: explains what it is for and which device name to enter (as shown in the log at startup: "Configure device <name>"). The options are grouped by device kind, each with a description of what it does and for which devices it is meant. New in the form: start delay for the movement duration, pedestrian opening for gates and the heating options
- README: section "Device specific configuration" rewritten accordingly

### Fixed

- A device specific entry now also matches the device name shown in Apple Home and in the log. Before, only the name from the TaHoma app worked, which can differ slightly (e.g. "Büro kl." in the TaHoma app, "Büro kl" in Apple Home)
- Removed the alarm option "occupancy sensor" from the settings and the README – it had no effect
- "Reverse direction" is no longer offered for garage doors – it only works for roller shutters and similar devices

## 2.4.0 (2026-11-16)

### Added

- Troubleshooting for a single device: with `"debug": true` in its device specific settings (settings form: *Device specific config* → *Troubleshooting*), the log shows at startup which commands and states the gateway offers for this device, plus the detailed log of its commands. Helps to find out why a device does not report changes (e.g. a garage door operated with its remote)

## 2.3.10 (2026-11-16)

### Fixed

- Log after Apple Home scenes: no more "setClosure undefined" lines for every device. Requires `@tplnet/overkiz-client` ^1.3.3, which marks only the devices that really failed. A failure is now logged as "FAILED:" with the reason from the gateway; without a reason, the gateway's message is logged, so the cause is visible

## 2.3.9 (2026-11-14)

* Fix: the settings form no longer shows "Config validation failed" because of the empty device-specific entry the form adds by itself – the device name of a `devicesConfig` entry is optional in the schema, entries without a device name are ignored by the plugin

## 2.3.8 (2026-11-13)

* Fix: roller shutters, blinds and awnings no longer stay on "Closing…"/"Opening…" in Apple Home when the motor reports its end position slightly off (e.g. 98 % closed instead of 100 %). A reported position within 3 % of the target position is shown as the target

## 2.3.7 (2026-11-13)

* Requires `@tplnet/overkiz-client` ^1.3.2: no wrong `TIMED_OUT` 2 minutes after a successful command with the local API; the device is no longer considered busy after completion, so state changes (remote, TaHoma app) show up right away
* Names: when the gateway reports its default name for a known device (e.g. "IO (5978041)" after a gateway restart, before the names from the TaHoma app are synchronised again), the current name is kept. Real renames in the TaHoma app are still taken over; service names follow the accessory name

## 2.3.6 (2026-11-13)

* Requires `@tplnet/overkiz-client` ^1.3.1: faster reconnect after a gateway outage (last known IP address), clearer log messages, expected `400 No registered event listener` after a gateway restart handled as info
* Fix: `HAPStatus` is taken from the Homebridge API (`api.hap`) instead of importing the `homebridge` package at runtime – the plugin no longer depends on Homebridge's package being resolvable from the plugin directory
* Log: "Rename accessory …" no longer claims the naming rules as reason (also shown for devices renamed in the TaHoma app)
* Wording: "Apple Home" instead of "HomeKit" in README, settings and the execution label shown in the TaHoma app history (" - Apple Home")

## 2.3.5 (2026-11-12)

* Fix: accessory and service names are made HomeKit compatible (must start and end with a letter or number), e.g. "Büro kl." → "Büro kl", "IO (6649146)" → "IO 6649146". Removes the HAP-NodeJS "invalid 'Name' characteristic" warnings; cached accessories are renamed once (log: "Rename accessory …"). Names in the TaHoma app are not changed
* Display name in the Homebridge UI: "Homebridge Somfy TaHoma (tplnet)"

## 2.3.3 (2026-11-12)

* Fix: a discovery retry after a partial failure no longer builds already mapped accessories twice (duplicate state listeners)
* Config schema/README: `pollingPeriod` defaults 5 s (local) / 60 s (cloud), minimum 1 s for the local API
* README: migration from `homebridge-tahoma` – never install both plugins at the same time (Homebridge would remove the cached accessories)
* Works with `@tplnet/overkiz-client` 1.3.0 (faster local polling, polling back-off capped, mDNS fixes)

## 2.3.2 (2026-11-12)

* Security: removed dependency `moment` (GHSA-4p3w-j4w9-5jqw); the `lowSpeed` time slot is computed with `Date` (same behaviour, verified against the old implementation)
* Security: lockfile pulls axios 1.21.1 / follow-redirects 1.16.3 through `@tplnet/overkiz-client`; dev dependencies fixed (`npm audit fix`, minimatch override) – `npm audit` reports 0 vulnerabilities

## 2.3.1 (2026-11-12)

* Requires `@tplnet/overkiz-client` ^1.2.0: cloud rate limits respected (default `refreshPeriod` 1440 min in the cloud, no re-login on 429), local API: TLS verified with the Overkiz root CA (`tlsInsecure` as fallback), discovery via mDNS `gateway_pin`, high priority/scenarios/refresh fall back gracefully
* Fix: a failing scenario list no longer aborts device discovery
* Startup state refresh only on cloud services
* Config schema/README: `refreshPeriod` defaults, new `tlsInsecure` option; issue template points to the Somfy Developer Mode

## 2.3.0 (2026-11-12) – fork

* Forked from dubocr/homebridge-tahoma 2.2.64, published as `@tplnet/homebridge-tahoma`
* Uses forked API client `@tplnet/overkiz-client` (npm alias, imports unchanged)
* Platform name `Tahoma` unchanged – drop-in replacement
* Release via GitHub Actions + npm Trusted Publishing; no automatic version bump on publish
* Fix: discovery retry delay is capped at 5 minutes (was doubling forever; upstream PR #572)
* Fix: commands no longer get overwritten by a stale server state right after sending (in-flight tracking for `isIdle`), no EventEmitter leak warnings on batched commands (from maximekduval/homebridge-tahoma)
* Fix: process-wide error handlers are installed only once
* Feature: one full-state refresh after startup; `refreshPeriod: 0` disables the periodic refresh (from maximekduval/homebridge-tahoma)
* Includes `@tplnet/overkiz-client` 1.1.x fixes: lost batched commands, reconnect after network error
* Node.js 26 supported (`engines`, CI matrix); tested with Homebridge 2.5.0

## 2.2.54 (2022-12-20)

### Bug Fixes

* Fix nodejs compatibility to node v12.4.0