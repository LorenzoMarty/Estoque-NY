# Observability: errors, uptime and alerts

## What the code does

| Piece | How to turn it on | What you get |
|---|---|---|
| API errors → Sentry | `SENTRY_DSN` (+ optional `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`) on the API host | Every unhandled exception (HTTP 500) as an event, tagged with the **request id** (`request_id`) that also appears in the JSON error body and in the `X-Request-ID` response header |
| Browser errors → Sentry | `VITE_SENTRY_DSN` (+ optional `VITE_SENTRY_RELEASE`) at **build** time | Unhandled errors and promise rejections; the SDK is a separate chunk loaded only when a DSN exists |
| Health endpoints | always on | `GET /health` (process is up) and `GET /health/db` (can reach the database) |

Not captured on purpose: 4xx responses (validation errors, 401/403/404/409) and
`/health`; logs below ERROR; personal data (cookies, IPs, request bodies). Without a
DSN nothing is sent and the app behaves as before.

Find an event from a user report: take the `request_id` (or `X-Request-ID` header) and
search `request_id:<value>` in Sentry; the same id is in the request log line
(`app.request`).

### Source maps for readable browser stack traces

`npm run build` writes **hidden** source maps (`*.map`, not referenced from the bundles).
Upload them for the release and keep them off the public site:

```bash
npx @sentry/cli sourcemaps upload --release "$VITE_SENTRY_RELEASE" frontend/dist/assets
```

Use the same `VITE_SENTRY_RELEASE` value (for example the commit SHA) in the build and
in the upload. This needs a Sentry auth token (`SENTRY_AUTH_TOKEN`, org and project).

## What still has to be set up outside the code

These need accounts; none of it can be done from the repository.

1. **Create the Sentry projects** (one for the API, one for the web app) and set the DSNs
   on the hosts (Render for the API, the static host build for `VITE_SENTRY_DSN`).
2. **Uptime monitor** on `https://<api>/health` **and** `https://<api>/health/db` every 1
   minute from an external service (UptimeRobot, Better Stack, Render health checks plus
   an external one). `/health/db` is the one that catches a lost database connection.
3. **Alert channel**: email at minimum, WhatsApp or Slack if someone watches it. Route
   both the uptime monitors and the Sentry alert rule "new issue" / "issue spike" there.
4. **Check end to end** once, in staging: deploy with a DSN, trigger a failure, see the
   event in Sentry with its `request_id`, stop the API and see the uptime alert fire.

## Checklist

- [ ] API DSN set in production
- [ ] Web DSN set at build time, source maps uploaded for the release
- [ ] Uptime monitors on `/health` and `/health/db`
- [ ] Alert channel receives a test alert
- [ ] End-to-end check done in staging
