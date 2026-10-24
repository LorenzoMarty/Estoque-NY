# ADR 0004: an unsafe CORS config stops the API in production

- Status: accepted
- Date: 2026-10-04

## Context

The API uses credentials. A `*` in `CORS_ORIGINS` became `allow_origin_regex=".*"`, which accepts any origin.

## Decision

With `APP_ENV=production`, an empty `CORS_ORIGINS` or one containing `*` makes the API refuse to start.

## Consequences

A bad config fails loudly at deploy time instead of silently opening the API. The first deploy after this change must set the real origin in the Render dashboard.
