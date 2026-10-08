# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in RelayPoint, please report it
privately using [GitHub Security Advisories](https://github.com/willuhmjs/relaypoint/security/advisories/new).

**Please do not open a public issue for security problems.** Public reports
can put self-hosted deployments at risk before a fix is available.

We aim to:

- Acknowledge private reports within **5 business days**.
- Investigate and keep you informed of progress.
- Publish a fix and a security advisory when possible.

## Supported Versions

| Version            | Supported      |
| ------------------ | -------------- |
| `main`             | ✅             |
| `< latest release` | ⚠️ best-effort |

## Notes for Self-Hosters

- Always set a strong, unique `AUTH_SECRET` (generate one with
  `openssl rand -base64 32`).
- Keep `PUBLIC_AUTH_PROVIDER_LOCAL_ENABLED` disabled unless you need the
  built-in email/password login for development.
- Serve RelayPoint behind TLS in production. The WebSocket sync channel and
  session cookies should never travel over plain HTTP on an untrusted network.
- The S3 bucket policy in `public-policy.json` grants **public read** access
  to uploaded display content by design (display clients fetch content
  without credentials). Do not use the same bucket for private files.
