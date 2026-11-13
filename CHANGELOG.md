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