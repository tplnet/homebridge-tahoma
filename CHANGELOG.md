## 2.3.0 (2026-11-12) – fork

* Forked from dubocr/homebridge-tahoma 2.2.64, published as `@tplnet/homebridge-tahoma`
* Uses forked API client `@tplnet/overkiz-client` (npm alias, imports unchanged)
* Platform name `Tahoma` unchanged – drop-in replacement
* Release via GitHub Actions + npm Trusted Publishing; no automatic version bump on publish
* Fix: discovery retry delay is capped at 5 minutes (was doubling forever; upstream PR #572)
* Fix: commands no longer get overwritten by a stale server state right after sending (in-flight tracking for `isIdle`), no EventEmitter leak warnings on batched commands (from maximekduval/homebridge-tahoma)
* Fix: process-wide error handlers are installed only once
* Feature: one full-state refresh after startup; `refreshPeriod: 0` disables the periodic refresh (from maximekduval/homebridge-tahoma)
* Includes client fixes of `@tplnet/overkiz-client` 1.1.0 (lost batched commands, reconnect after network error, 429 re-login)
* Node.js 26 supported (`engines`, CI matrix); tested with Homebridge 2.5.0

## 2.2.54 (2022-12-20)

### Bug Fixes

* Fix nodejs compatibility to node v12.4.0