# Roadmap

Deliberately-deferred work from the October 2026 security & quality audit, plus
product ideas. Roughly ordered by value-per-effort within each tier.

## Security hardening

- **Per-display access tokens for the kiosk API.** `/display/:id/sync` and
  `/content/*` are deliberately public today (a display has no login). Issue a
  rotating per-display token (QR-provisioned) and require it on both, while
  keeping a "public displays" mode for installations that want zero setup.
- **Full site CSP with nonces.** The app currently ships
  `frame-ancestors 'self'` + sandboxed CSP for `/content`-served user HTML.
  Move to a nonce-based `script-src`/`style-src` policy on all authenticated
  pages. (Needs a per-request hash/nonce plumbing through `app.html`.)
- **Login rate limiting / lockout.** Local login currently answers unlimited
  attempts; add per-IP + per-account token bucket (in-memory is fine
  single-node, Redis for multi-node).
- **Dedicated staging flag for staged uploads.** `Slide.isHidden` is overloaded
  ("hidden by user" and "upload not yet finalized"), which blocks a safe sweeper
  for abandoned staging rows. Add `staged Boolean` and periodically delete
  staged rows older than N hours (plus their S3 objects).
- **Presigned direct-to-bucket uploads.** The upload route buffers bodies in
  the Node process (bounded by `MAX_UPLOAD_BYTES_MB`). Presigned PUTs move the
  byte stream to the storage layer and remove the `BODY_SIZE_LIMIT` coupling.

## Quality

- **Vitest unit-test suite.** Fast Node-side tests for `slideMime`,
  `localAuth`, `safeLinkUrl`, timeline math in `iframePool`, and the WS
  identify/heartbeat state machine. CI currently only runs Playwright.
- **Tighten `@typescript-eslint/no-explicit-any` to `error`.** 22 legacy sites
  remain (dynamic OAuth provider bags, vendored shadcn prop helpers); convert
  incrementally and flip the rule in `eslint.config.js`.
- **`<track kind="captions">`** (or `title`/`aria-label` fallback) on the
  SlideCard video preview to clear the last a11y warning.

## Product

- **Scheduling.** Calendar windows per display/group (day parts, date ranges,
  expiry) — the schema groundwork (`order`, groups) is already there.
- **WEB slide type.** Native embedded web pages with a hardened CSP, replacing
  today's "upload an HTML file that iframes it" pattern.
- **Display provisioning flow.** First-run QR from the dashboard that pairs a
  screen to a group in one scan (pairs naturally with per-display tokens).
- **Client-side change queue.** Queue dashboard edits while the server is
  unreachable and replay them (idempotently) on reconnect.
- **Flash-message infrastructure.** A store-backed toast across all actions;
  replaces the per-form `message` strings and `location.reload()`s.
- **Mobile dashboard polish.** The management UI works on phones but slide
  reordering and dialogs want touch-specific passes.
- **Official Android APK story.** The repo ships an APK management page; an
  actual maintained client (WebView wrapper + pairing + offline cache) would
  round out "Android TV boxes" in the marketing copy.
