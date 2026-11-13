# Security policy

## Supported versions

Only the latest released version of `@tplnet/homebridge-tahoma` receives fixes. Please update before reporting.

## How dependencies are checked

- Once a week and on every dependency change the *Compatibility & CVE check* workflow runs `npm audit`: any known vulnerability (CVE / GitHub advisory) in a runtime dependency fails the check; findings in development tools are reported.
- The same workflow starts the plugin with the newest Homebridge release (and the beta) on Node.js 22, 24 and 26.
- Dependabot opens update pull requests weekly, security updates immediately. They run all checks and are merged when green.
- A release is only published when the audit is clean and the plugin starts with the newest Homebridge release.

## Reporting a vulnerability

Please do **not** open a public issue. Use *Security* → *Report a vulnerability* in this GitHub repository (private vulnerability reporting).

Please include the affected version, a description and, if possible, steps to reproduce. You will get a first response within a few days. Once a fix is released, the issue is published as a GitHub security advisory.

Vulnerabilities in the API client belong to [`@tplnet/overkiz-client`](https://github.com/tplnet/overkiz-client/security); issues in Homebridge itself to [homebridge/homebridge](https://github.com/homebridge/homebridge/security).
