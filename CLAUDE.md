# @tplnet/homebridge-tahoma

Maintained fork of dubocr/homebridge-tahoma ("Homebridge Somfy TaHoma (tplnet)"), platform name `Tahoma`, drop-in replacement. Uses `@tplnet/overkiz-client` through the npm alias `overkiz-client`.

## Commands
- `npm run lint`, `npm run build`, `npm audit --omit=dev`
- `npm install --no-save homebridge@latest && npm run smoke` – starts Homebridge with the plugin (compatibility check)
- Preview release notes: `node scripts/release-notes.mjs [version]`

## Project rules
- Position tolerance for roller shutters, blinds and awnings stays global at 3 % (`RollerShutter.POSITION_TOLERANCE`); no per-device option.
- Names: keep the current name when the gateway reports a default name such as "IO (5978041)"; names must be valid for Apple Home.
- `devicesConfig` entries without a device name are ignored (the settings form adds an empty entry by itself).
- `HAPStatus` comes from `api.hap`, never from a runtime import of `homebridge`.
- Both plugins (this fork and `homebridge-tahoma-local`) coexist for now; the client stays a separate package.

## Rules for all tplnet Homebridge projects

These apply to `@tplnet/homebridge-tahoma`, `@tplnet/overkiz-client`, `homebridge-tahoma-local` and `@tplnet/homebridge-denon-heos-audio`. Keep the four projects consistent: a change to the release or check process in one of them goes into all of them.

### Language and wording
- Code, comments, README, CHANGELOG and commit messages in English. No German translation of the plugin (exception for now: the German settings form of `@tplnet/homebridge-denon-heos-audio`).
- User-facing text says "Apple Home", not "HomeKit" (README, settings schema, log messages, execution labels). Technical code comments may keep "HomeKit".

### README
- Every README has the disclaimer: a short note at the top ("Private hobby project, developed in spare time with the help of AI tools. Use at your own risk; support is best effort. See the disclaimer.") and a "Disclaimer" section before the license / credits: private project to keep compatibility, security updates, features and bug fixes going; developed in spare time with the help of AI tools; use at your own risk, no warranty (link to the project's license); questions, bug reports and requests are handled best effort, without guarantee; not affiliated with the brands named in the project.
- Keep the "Compatibility and security" (or "Security") and "Privacy" sections up to date where the README has them.

### Compatibility and CVEs
- Every change and every release: `npm audit --omit=dev` must report 0 vulnerabilities in the runtime dependencies, and plugins must start with the newest Homebridge release (smoke test against `homebridge@latest`, CI on Node.js 22, 24 and 26).
- Automated in `.github/workflows/compat.yml` (weekly, on dependency changes) and in `publish.yml` (blocks the release). Keep this documented in the README.
- Dependabot pull requests can be merged when all checks are green.

### Release process
1. Write a `## X.Y.Z (YYYY-MM-DD)` section at the top of `CHANGELOG.md` **before** `npm version`. Each entry starts with what changes for the user (Apple Home, Homebridge UI, log), technical details after it. With several entries, group them under `### Added`, `### Changed`, `### Fixed`, `### Security`.
2. `npm version patch|minor|major` (the npm `version` script runs `scripts/release-notes.mjs` and refuses to continue without the section), then `git push --follow-tags` (needs annotated tags).
3. `publish.yml` checks tag, CHANGELOG, CVEs, lint, build and Homebridge compatibility, **stages** the package with `npm stage publish` (pre-releases with `--tag next`) and creates the GitHub release: title = version without "v", notes from CHANGELOG plus the "Checked for this release" block and a "Changelog" link, `--generate-notes`, pre-releases marked as such.
4. The maintainer approves the staged version with his passkey (npmjs.com → Staged Packages, or `npm stage approve <id>`).
- Never run `npm publish` manually (npm Trusted Publishing is stage-only; a manual publish burns the version number).
- `release-notes.yml` (Actions → Release notes → tag or `all`) refills existing releases from CHANGELOG.
- Plugin depending on a new client version: release and approve the client first, then `npm install --prefer-online` in the plugin (otherwise ETARGET from the npm cache).

### Git and security
- Commit as `tplnet <tplnet@users.noreply.github.com>`; never put the maintainer's real name or e-mail into commits or files.
- `master` is protected against deletion and force pushes. Security issues: private vulnerability reporting (see `SECURITY.md`).
- Never commit credentials, tokens or gateway PINs; mask them in logs and issues.
