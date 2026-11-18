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