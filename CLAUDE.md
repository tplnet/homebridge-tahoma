# @tplnet/homebridge-tahoma

Maintained fork of dubocr/homebridge-tahoma ("Homebridge Somfy TaHoma (tplnet)"), platform name `Tahoma`, drop-in replacement. Since 3.0.0 it supports Somfy TaHoma only (local API and Somfy cloud) and the API client is built in (`src/overkiz/`, derived from the former `homebridge-tahoma-local` and `@tplnet/overkiz-client`, both archived; the client is deprecated on npm). Detaching the repository from the fork network of dubocr/homebridge-tahoma is requested at GitHub Support (2026-11-23); afterwards the README says "based on dubocr/homebridge-tahoma" instead of "maintained fork", and this description is updated.

## Commands
- `npm run lint`, `npm run build`, `npm audit --omit=dev`
- `npm test` – accessory IDs (`test/device-uuid.mjs`), smoke test against a simulated gateway (`test/smoke.mjs`), gateway outage (`test/outage.mjs`) and the cloud client against a simulated Somfy cloud (`test/cloud-client.mjs`); run `npm run build` first
- `npm install --no-save homebridge@latest && npm run smoke` – starts Homebridge with the plugin (compatibility check)
- Preview release notes: `node scripts/release-notes.mjs [version]`

## Project rules
- Position tolerance for roller shutters, blinds and awnings stays global at 3 % (`RollerShutter.POSITION_TOLERANCE`); no per-device option.
- Names: keep the current name when the gateway reports a default name such as "IO (5978041)"; names must be valid for Apple Home.
- `devicesConfig` entries without a device name are ignored (the settings form adds an empty entry by itself).
- `HAPStatus` comes from `api.hap`, never from a runtime import of `homebridge`.
- Only Somfy TaHoma services (local API, Somfy cloud); other Overkiz services are rejected with a clear error and cached accessories are kept.
- Accessory IDs must never change (they carry rooms and automations in Apple Home): the ID calculation matches 2.x exactly (`test/device-uuid.mjs`), and the safety stops in `Platform.ts` (no match between cache and gateway, or more than half would be removed) stay.
- The platform name stays `Tahoma` (Timo's decision 2026-11-23): cached accessories are bound to it, and a new name would mean setting up all devices, rooms and automations again. Only if the Homebridge verification review asks for it: add a new name and keep `Tahoma` registered as well (as in `@tplnet/homebridge-heos-multiroom-audio`), so existing configurations keep their accessories; `SomfyTaHoma` is taken by another verified plugin. Don't rename without asking Timo.
- Larger changes are developed on a branch and published as betas (`X.Y.Z-beta.N`, npm dist-tag `beta`), as for 3.0.0. See `docs/releasing.md`.

## Rules for all tplnet Homebridge projects

These apply to `@tplnet/homebridge-tahoma` and `@tplnet/homebridge-heos-multiroom-audio` (`@tplnet/overkiz-client` and `homebridge-tahoma-local` are archived since 2026-11-23). Keep the projects consistent: a change to the release or check process in one of them goes into all of them. New tplnet projects adopt these rules from the start.

Notes that concern several projects (a change to port, a new rule, what still has to be done in another project) are written into this section – in the `CLAUDE.md` of both projects – not only into a note of a Claude project: every session reads the `CLAUDE.md` of its repository, whichever Claude project it belongs to. When a change in one project still has to be ported to another one, note it here as an open item and remove it once it is done everywhere.

### Language and wording
- Code, comments, README, CHANGELOG and commit messages in English. No German translation of the plugin (exception for now: the German settings form of `@tplnet/homebridge-heos-multiroom-audio`).
- User-facing text says "Apple Home", not "HomeKit" (README, settings schema, log messages, execution labels). Technical code comments may keep "HomeKit".

### README
- Every README has the disclaimer: a short note at the top ("Private hobby project, developed in spare time with the help of AI tools. Use at your own risk; support is best effort. See the disclaimer.") and a "Disclaimer" section before the license / credits: private project to keep compatibility, security updates, features and bug fixes going; developed in spare time with the help of AI tools; use at your own risk, no warranty (link to the project's license); questions, bug reports and requests are handled best effort, without guarantee; not affiliated with the brands named in the project.
- Keep the "Compatibility and security" (or "Security") and "Privacy" sections up to date where the README has them.

### Documentation structure
- Keep the README short: what the project is, requirements, installation, quick configuration, compatibility and security, privacy, a "Documentation" list, contributing, disclaimer, license.
- Details go into `docs/`: `configuration.md` (all options, settings for single devices, several gateways), `troubleshooting.md` (problems, debug log, reporting a problem), `releasing.md` (maintainers), images in `docs/images/`. Each page starts with a "← Back to the README" link.
- Links from the README to `docs/` are absolute GitHub URLs (`https://github.com/tplnet/<repo>/blob/master/docs/...`) so they also work on npm; inside `docs/` relative links. `docs/` is not part of the npm package.
- Screenshots of the settings form come from a real Homebridge UI with the plugin (no real credentials, example devices only), collapsible with `<details>`. Update them when the settings form changes.

### Compatibility and CVEs
- Every change and every release: `npm audit --omit=dev` must report 0 vulnerabilities in the runtime dependencies, and plugins must start with the newest Homebridge release (smoke test against `homebridge@latest`, CI on Node.js 22, 24 and 26).
- Automated in `.github/workflows/compat.yml` (weekly, on dependency changes) and in `publish.yml` (blocks the release). Keep this documented in the README.
- Dependabot pull requests can be merged when all checks are green.

### Malware scan
- Dependencies are installed with `npm ci --ignore-scripts` in every workflow (their install scripts never run). Our own packages must not need install scripts.
- `.github/workflows/malware.yml` (weekly, on dependency changes, on demand) and `publish.yml` (blocks the release) run the composite action `.github/actions/malware-scan`: OSV-Scanner (pinned version, SHA-256 checked) against `package-lock.json` – any known malicious package (OSV `MAL-…`) fails – and ClamAV over the `npm pack` tarball and `node_modules` (signatures cached between runs). The logic is in `scripts/malware-scan.mjs` (`npm run malware`, needs `osv-scanner` and `clamscan` locally).
- `.github/actions/malware-scan`, `malware.yml` and `scripts/malware-scan.mjs` are identical in all projects; new projects copy them. To update OSV-Scanner, change version and SHA-256 (from `osv-scanner_SHA256SUMS` of the release) in the action in all projects.
- README: "Malware scan" badge next to the other workflow badges and a bullet in "Compatibility and security" / "Security"; SECURITY.md describes the scan.

### Homebridge UI and log
- The window *Plugin Logs* (Homebridge UI → *Plugins* → ⋮) only shows log lines that start with the cyan prefix `[<name>]`, where `<name>` is the `name` of the plugin's config entry (without one: the package name, which Homebridge doesn't use for the plugin's lines – the window then stays empty except right after a restart). Every plugin's settings schema therefore has a `name` field with a default, and the plugin logs through the Homebridge logger. Own console output (e.g. a debug console log) uses the same prefix: `` `\x1b[36m[${config.name}]\x1b[39m` ``. Found in `@tplnet/homebridge-heos-multiroom-audio` 1.5.1-beta.8.
- Homebridge verification checks (homebridge/plugins, automatic): the settings schema must not use `"required": true/false` on single fields – required fields are listed as `"required": ["a", "b"]` at object level (JSON Schema); `package.json` keywords declare the transport: `supports-hap` for plugins that publish HAP accessories (`supports-matter` only for plugins that register Matter accessories themselves). Found in the verification request of `@tplnet/homebridge-heos-multiroom-audio` (fixed in 1.5.2-beta.1).

### Release process
1. Write a `## X.Y.Z (YYYY-MM-DD)` section at the top of `CHANGELOG.md` **before** `npm version`. Each entry starts with what changes for the user (Apple Home, Homebridge UI, log), technical details after it. With several entries, group them under `### Added`, `### Changed`, `### Fixed`, `### Security`.
2. `npm version patch|minor|major` (the npm `version` script runs `scripts/release-notes.mjs` and refuses to continue without the section), then `git push --follow-tags` (needs annotated tags).
3. `publish.yml` checks tag, CHANGELOG, CVEs, lint, build and Homebridge compatibility, **stages** the package with `npm stage publish` (pre-releases with the dist-tag of their identifier, e.g. `--tag beta` for `X.Y.Z-beta.N`, which the Homebridge UI uses to offer newer betas) and creates the GitHub release: title = version without "v", notes from CHANGELOG plus the "Checked for this release" block and a "Changelog" link, `--generate-notes`, pre-releases marked as such.
4. The maintainer approves the staged version with his passkey (npmjs.com → Staged Packages, or `npm stage approve <id>`).
- Never run `npm publish` manually (npm Trusted Publishing is stage-only; a manual publish burns the version number).
- `release-notes.yml` (Actions → Release notes → tag or `all`) refills existing releases from CHANGELOG.

### Git and security
- Commit as `tplnet <tplnet@users.noreply.github.com>`; never put the maintainer's real name or e-mail into commits or files.
- `master` is protected against deletion and force pushes. Security issues: private vulnerability reporting (see `SECURITY.md`).
- Never commit credentials, tokens or gateway PINs; mask them in logs and issues.
