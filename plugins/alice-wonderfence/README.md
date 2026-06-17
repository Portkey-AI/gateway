# Alice WonderFence Plugin for Portkey Gateway

Content moderation guardrails powered by [Alice WonderFence](https://alice.io/products/wonderfence). Supports blocking, masking, and detecting harmful and mallicious content in both prompts and responses.

### Why WonderFence?

- **Real-time GenAI protection** — purpose-built for LLM inputs and outputs, not retrofitted from legacy content moderation
- **Broadest policy coverage** — detects prompt injections, jailbreaks, toxic content, PII, and regulated topics out of the box
- **Actionable responses** — returns granular BLOCK / MASK / DETECT verdicts with policy-specific details, not just a score
- **Security-focused** — protects against sensitive information disclosure, meta-prompt extraction, and model repurposing attacks
- **Low latency** — designed for inline guardrailing at production scale with minimal overhead

## Prerequisites

- Node.js 18+, npm
- A WonderFence **API key** and an **app ID** (UUID). The app ID identifies the
  application whose policy set WonderFence applies; obtain it from the
  Alice/WonderFence console when you create an app.

## Setup

### 1. Install dependencies

```bash
cd portkey-gateway
npm install
```

### 2. Install the WonderFence SDK

```bash
npm install @alice-io/wonderfence-ts-sdk
```

### 3. Provide credentials

Set the API key per guardrail via `credentials` in the check `parameters`
(recommended — see below), or export it as a fallback env var before starting
the gateway:

```bash
export ALICE_API_KEY="your-wonderfence-api-key"
```

The `appId` (UUID) has **no env fallback** — it must come from the guardrail
`credentials` (or, when `allowRequestMetadataOverride` is enabled, from
`x-portkey-metadata`).

### 4. Enable the plugin in `conf.json`

```json
{
  "plugins_enabled": ["default", "alice-wonderfence"]
}
```

### 5. Build plugins

```bash
npm run build-plugins
```

### 6. Start the gateway

```bash
npm run dev:node
```

### 7. Send a request with guardrails

Pass a config via `x-portkey-config` header that includes `before_request_hooks` and/or `after_request_hooks`. Each hook has an `id`, `type`, `deny` flag, and a `checks` array referencing the plugin. Use `x-portkey-metadata` for session/user tracking:

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H 'x-portkey-metadata: {"session_id": "conv-123", "user_id": "user-456"}' \
  -H 'x-portkey-trace-id: trace-789' \
  -H 'x-portkey-config: {
    "provider": "openai",
    "api_key": "sk-...",
    "before_request_hooks": [{
      "id": "alice-input",
      "type": "guardrail",
      "deny": true,
      "checks": [{
        "id": "alice-wonderfence.evaluateContent",
        "parameters": {
          "credentials": {
            "apiKey": "your-wonderfence-api-key",
            "appId": "11111111-1111-4111-8111-111111111111"
          },
          "debug": true
        }
      }]
    }],
    "after_request_hooks": [{
      "id": "alice-output",
      "type": "guardrail",
      "deny": true,
      "checks": [{
        "id": "alice-wonderfence.evaluateContent",
        "parameters": {}
      }]
    }]
  }' \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello, how are you?"}]
  }'
```

**Session tracking priority:** `x-portkey-metadata.session_id` > `x-portkey-trace-id` > SDK auto-generated UUID.

## Parameters

Parameters are passed inside each check's `parameters` object.

| Parameter                      | Type                           | Default | Description                                                                                                                                                |
| ------------------------------ | ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credentials`                  | `{ apiKey, appId, baseUrl }`   | —       | WonderFence API credentials. `apiKey` falls back to the `ALICE_API_KEY` env var; `appId` (UUID) has no fallback. `baseUrl` overrides the API base URL.     |
| `allowRequestMetadataOverride` | `boolean`                      | `false` | When `true`, `x-portkey-metadata` may supply `alice_wonderfence_api_key` / `alice_wonderfence_app_id`, used only after config `credentials` are absent.    |
| `debug`                        | `boolean`                      | `false` | Include `textExcerpt` in hook data and log text/masked excerpts on MASK actions.                                                                           |
| `failOpen`                     | `boolean`                      | `true`  | On SDK/network errors: `true` = allow request through, `false` = block. Does **not** apply to missing `apiKey`/`appId` — a misconfiguration always blocks. |
| `customFields`                 | `CustomField[]` or JSON string | —       | Custom fields forwarded to the WonderFence API for analysis context.                                                                                       |

### Credential resolution & per-team apps

`apiKey` and `appId` are resolved per request with admin-pinned config winning:

1. `parameters.credentials.{apiKey,appId}` (from the config attached to a
   Portkey API key — admin-pinned)
2. `x-portkey-metadata.alice_wonderfence_{api_key,app_id}` — **only if**
   `allowRequestMetadataOverride: true` (so callers can't bypass pinned creds)
3. `apiKey` only: `ALICE_API_KEY` env var

To run **different apps/teams** through the same gateway, attach a distinct
config (hence distinct `credentials.appId`) to each Portkey API key — the
equivalent of LiteLLM's per-key/per-team metadata.

## `deny` Behavior

The `deny` flag is set on the **hook** (not the check) and controls what happens when a check returns a `BLOCK` verdict:

- **`deny: true`** — the request is blocked with HTTP 446 and a `hooks_failed` error body containing detection details.
- **`deny: false`** — monitor-only mode. The check still runs and results are included in the response's `hook_results`, but the request is never blocked.

## Default Guardrails

To apply guardrails to **every request** without including hooks in each `x-portkey-config`, set default guardrails via headers:

- `x-portkey-default-input-guardrails` — JSON array of hooks applied before every request.
- `x-portkey-default-output-guardrails` — JSON array of hooks applied after every request.

These use the same hook format as `before_request_hooks` / `after_request_hooks` in the config.

## Expected Behaviors

- **Clean content** - normal response passthrough
- **Harmful content blocked** - HTTP 446 with `hooks_failed` error and detection details
- **PII masked** - response returned with content replaced by `actionText`
- **Detected content** - allowed through with detections included in hook data

## Actions

| SDK Action  | Behavior                           |
| ----------- | ---------------------------------- |
| `BLOCK`     | Request/response denied (HTTP 446) |
| `MASK`      | Content replaced with `actionText` |
| `DETECT`    | Allowed, detections logged         |
| `NO_ACTION` | Clean pass                         |

## Error Policy

**Default: fail-open.** On any SDK or network error the request is allowed through. Set `failOpen: false` in check parameters to fail-closed instead (block on error).

**Misconfiguration always blocks.** A missing/unresolvable `apiKey` or `appId` is treated as a configuration error and blocks the request regardless of `failOpen`, so a misconfigured guardrail never silently bypasses scanning.
