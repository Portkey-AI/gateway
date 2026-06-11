# Push Events from CI — Design

**Date:** 2026-06-11
**Status:** Approved

## Problem

The event system is batch-pull only: connectors (`cli/connectors/*.ts`) re-sync
history into `.cache/events/*.jsonl`, and `GET /api/events` merges those files
for the dashboard timeline. There is no way to fire a single event (e.g. a
deployment marker) the moment it happens — especially from a CI runner that
does not have this repo checked out.

## Solution Overview

Two pieces, reusing the existing `GatewayEvent` schema and the existing GET
merge/dedup unchanged:

1. **`POST /api/events`** on the dashboard — token-authenticated, appends one
   event to `.cache/events/pushed.jsonl`. Curl-friendly: only `type` is
   required.
2. **`cli/send-event.ts`** — a citty command that wraps the POST, auto-detects
   CI metadata, and falls back to a direct local file append when no gateway
   URL is configured.

Security model (decided up front): **secrets come from env vars, payload from
CLI args.** Args leak into `ps`, shell history, and CI logs; env vars are how
CI systems inject secrets natively.

## 1. Endpoint — `POST /api/events`

- **Auth:** `Authorization: Bearer <token>` checked against the
  `MAGIC_GATEWAY_TOKEN` env var on the dashboard server.
  - Env var unset → `503` with message "set MAGIC_GATEWAY_TOKEN to enable
    event ingestion". No token, no remote writes, ever.
  - Missing/wrong token → `401`.
- **Body:** JSON. Only `type` (non-empty string) is required —
  `{"type":"deploy"}` is a valid complete request. Optional fields:
  - `title` (string), `source` (string, default `"push"`),
    `tags` (flat map; values must be strings), `body` (string),
    `timestamp` (epoch ms, default: server now),
  - interval fields for outage-style events: `endTimestamp`, `ongoing`.
- **Server derives** (same logic as `makeEvent` in `cli/lib/events.ts`):
  - `date` — ISO-8601 UTC (Z) from `timestamp` (per the universal ISO-Z rule),
  - `id` — `stableId(type + source + timestamp + title)`,
  - standard tags: `type`, `source`, `day`, `month` (+ `status: ongoing`).
- **Storage:** `appendFileSync` of one JSON line to
  `.cache/events/pushed.jsonl`. The existing GET already merges per-source
  files and dedupes by `id`, so a retried CI job sending an identical payload
  does not double-plot.
- **Validation:** reject non-string `type`, non-string tag values, and bodies
  over 32 KB. Return the stored event (including derived `id`) on success.
- **Curl one-liner** (documented in README):

  ```bash
  curl -X POST "$MAGIC_GATEWAY_URL/api/events" \
    -H "Authorization: Bearer $MAGIC_GATEWAY_TOKEN" \
    -d '{"type":"deploy","tags":{"sha":"'$GITHUB_SHA'"}}'
  ```

## 2. CLI — `cli/send-event.ts`

```bash
npx tsx cli/send-event.ts deploy                           # in CI, that's it
npx tsx cli/send-event.ts deploy --title "v2.1" --tag env=production
```

- **Positional arg = event type.** Everything else optional:
  `--title`, `--source`, `--tag key=value` (repeatable), `--body`,
  `--timestamp`.
- **Config from env:** `MAGIC_GATEWAY_URL`, `MAGIC_GATEWAY_TOKEN`. Never via
  args.
- **CI auto-detection (GitHub Actions first):** when present, `GITHUB_SHA` /
  `GITHUB_REF_NAME` / `GITHUB_REPOSITORY` / `GITHUB_RUN_ID` become
  `sha` / `branch` / `repo` / `runId` tags, and the default title becomes
  e.g. `Deploy a1b2c3d (main)`. Explicit `--tag` / `--title` always wins.
  Other CI vendors can be added later.
- **Local fallback:** when `MAGIC_GATEWAY_URL` is unset, append directly to
  `.cache/events/pushed.jsonl` using the existing `makeEvent` / `stableId`
  helpers — zero-setup for local scripts, no token needed.
- **Packaging:** dependency-light (citty + global `fetch` + `cli/lib/events`)
  so it can later be lifted into a publishable npx package as a file move,
  not a rewrite.

## Error Handling

- CLI exits non-zero on HTTP failure and prints the response body — CI
  surfaces it. No retries (CI retries the job if it cares).
- Endpoint never partially writes: validate fully, then append one line.

## Testing

- **Route tests:** auth matrix (env unset → 503, missing/wrong token → 401,
  valid token → 200), append happy path, derived fields (id, date, day/month
  tags), oversized-body and bad-type rejection, GET round-trip dedup by id.
- **CLI tests:** payload construction with mocked env (GitHub vars present /
  absent), `--tag` override precedence, local-fallback file append, non-zero
  exit on HTTP error.

## Alternatives Considered

- **Type-specific subcommands** (`send-event deploy`, `send-event outage`
  with bespoke flags) — rejected for YAGNI; the generic type + tags shape
  matches the schema and dashboard. Subcommands can layer on later.
- **Curl-only, no CLI** — rejected; loses CI auto-detection and the local
  fallback.
- **CLI args for the token** — rejected; leaks via process lists, shell
  history, and CI logs.
