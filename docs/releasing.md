# Releasing (maintainers)

[← Back to the README](../README.md)

```sh
npm audit --omit=dev                                      # must report 0 vulnerabilities
npm install --no-save homebridge@latest && npm run build && npm run smoke   # newest Homebridge
npm version patch   # or minor / major – bumps package.json and creates the annotated tag vX.Y.Z
git push --follow-tags
```

The `Publish to npm` workflow **stages** the version on npm via Trusted Publishing (stage-only permission) and creates a GitHub release.
The version becomes public only after approval with 2FA/passkey: npmjs.com → package → *Staged Packages*, or `npm stage approve <stage-id>`
(the id is shown in the workflow run summary and by `npm stage list <package>`).

Release notes: before tagging, describe the changes in a `## X.Y.Z` section at the top of `CHANGELOG.md`. `npm version` refuses to run without it, and the workflow uses this section as the description of the GitHub release (and stops before publishing if it is missing). Start each entry with what changes for the user, technical details after it; with several entries, group them under `### Added`, `### Changed`, `### Fixed` and `### Security`. The release also lists what was checked before it went out (newest Homebridge release, no known vulnerabilities, tested Node.js versions, no known malicious packages or malware). Pre-release versions (e.g. `1.4.0-beta.1`) are published under the npm dist-tag named after their identifier (`beta`, which the Homebridge UI uses to offer newer betas) and marked as pre-release on GitHub. Existing releases can be (re)filled with *Actions* → *Release notes* → *Run workflow* (tag or `all`); the checks written by the publish run are kept.

## Betas

Larger changes (as for 3.0.0: Somfy TaHoma only, client built in) are developed on their own branch and published as betas first; `master` keeps the released version.

1. Create a branch for the change and bring `master` (e.g. Dependabot updates, fixes) into it regularly: `git merge master`.
2. **Beta:** add a section at the top of `CHANGELOG.md`, e.g. `## X.Y.Z-beta.1 (date)`, then on the branch: `npm version X.Y.Z-beta.1` (next ones: `npm version prerelease --preid beta`) and `git push --follow-tags`. The workflow stages it with the npm dist-tag **`beta`** and marks the GitHub release as pre-release; `latest` is not affected. Approve on npm as usual.
3. **Fix in the meantime:** on `master` as usual (`npm version patch`) – it becomes `latest`, betas are not affected.
4. **Release:** write a `## X.Y.Z (date)` section that combines the changes of all betas, merge the branch into `master`, `npm version X.Y.Z` on `master`, push, approve. Users of the beta get the release as an update.
