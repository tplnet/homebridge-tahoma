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