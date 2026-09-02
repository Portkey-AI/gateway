# Vigilnz AI Secure Plugin

Partner guardrail that routes Portkey prompts and completions through **Vigilnz AI Secure**
for prompt-injection, jailbreak, sensitive-data and policy enforcement.

Vigilnz acts only as a security checkpoint. Portkey keeps making the LLM call:

```
Agent → Portkey → Vigilnz AI Secure → PASS/BLOCK → Portkey → LLM
LLM   → Portkey → Vigilnz AI Secure → PASS/BLOCK/MODIFY → Portkey → Agent
```

## Setup

1. Sign in to the Vigilnz dashboard and copy your API key (starts with `vpsk_live_`).
2. In Portkey, go to **Guardrails → Add Guardrail → Vigilnz AI Secure → Configure**.
3. Enter the **Vigilnz API Key** and the **Vigilnz Base URL** of the environment you want to
   scan against, then save.
4. Attach the guardrail to a config as an input guardrail, an output guardrail, or both.

The base URL is per guardrail, so the same plugin can target any Vigilnz environment —
production, staging or development — by creating one guardrail per environment. Only the
host is entered; `/api/guardrail/scan` is appended automatically, and trailing slashes are
ignored. `https` is required, except for `localhost` during local development.

Self-hosted gateways that prefer to configure the host once can set the
`VIGILNZ_GUARDRAIL_BASE_URL` environment variable instead; the guardrail credential wins
when both are present.

Your Vigilnz API key identifies your tenant, so the policies, scanner model, confidence
thresholds and enforcement level configured in Vigilnz apply automatically. No policy
configuration is duplicated in Portkey.

## Function

| Function  | Id                 | Hooks                                   |
| --------- | ------------------ | --------------------------------------- |
| AI Secure | `vigilnz.aiSecure` | `beforeRequestHook`, `afterRequestHook` |

### Parameters

| Parameter     | Type    | Default | Description                                                                                                                                                                                                    |
| ------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redact`      | boolean | `false` | Ask Vigilnz to return redacted content instead of a pass/fail verdict only. Content is rewritten **only** when this is enabled; a `modify` verdict that arrives without it is ignored and reported as `allow`. |
| `timeout`     | number  | `8000`  | Milliseconds to wait for the Vigilnz verdict.                                                                                                                                                                  |
| `failOnError` | boolean | `false` | Fail the guardrail when Vigilnz errors, times out or rejects the key (fail-closed).                                                                                                                            |

### Supported request types

| Request type                          | Content read from                                    | Redaction writes back to              |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| `chatComplete`, `messages`            | last message's content                               | same content part                     |
| `complete`                            | `prompt`                                             | `prompt`                              |
| `embed`                               | `input`                                              | not applicable (input guardrail only) |
| `createModelResponse` (Responses API) | `input` (request) / `output[].content[]` (response)  | same field, other fields preserved    |
| anything else                         | Portkey's flattened `request.text` / `response.text` | not rewritable — scanned only         |

Redaction replaces the first text part, leaving other parts (images, reasoning items, tool
calls) untouched. When a payload shape has no addressable field to write back into, the
plugin reports `allow` with `ignoredAction: "modify"` rather than claiming a rewrite that
did not happen.

## Config example

```json
{
  "provider": "openai",
  "api_key": "$OPENAI_KEY",
  "before_request_hooks": [
    {
      "type": "guardrail",
      "id": "vigilnz-input",
      "deny": true,
      "checks": [
        {
          "id": "vigilnz.aiSecure",
          "parameters": {
            "credentials": {
              "apiKey": "vpsk_live_...",
              "baseUrl": "https://aigw.vigilnz.com"
            }
          }
        }
      ]
    }
  ],
  "after_request_hooks": [
    {
      "type": "guardrail",
      "id": "vigilnz-output",
      "deny": true,
      "checks": [
        {
          "id": "vigilnz.aiSecure",
          "parameters": {
            "credentials": {
              "apiKey": "vpsk_live_...",
              "baseUrl": "https://aigw.vigilnz.com"
            },
            "redact": true
          }
        }
      ]
    }
  ]
}
```

## Behaviour

| Vigilnz verdict | Portkey result                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow`         | `verdict: true` — request continues to the LLM / response returns to the caller.                                                             |
| `block`         | `verdict: false` — with `deny: true` the gateway returns **446** and the LLM is never called (input) or the completion is withheld (output). |
| `modify`        | `verdict: true` plus `transformedData` — the redacted text replaces the current content part.                                                |

Vigilnz returns `modify` only when the guardrail sets `redact: true` **and** the tenant is
in enforce mode; monitor mode never rewrites content. As defence in depth, the plugin also
ignores any `modify` verdict it did not ask for — it reports `action: "allow"` with
`ignoredAction: "modify"` rather than substituting unexpected content, so a server-side
regression cannot silently corrupt a prompt.

Failures (invalid key, outage, timeout, malformed body) return an `error` on the check.
Portkey's standard policy then applies: the guardrail still passes unless `failOnError`
is enabled, in which case it fails closed.

## Wire contract

`POST {baseUrl}/api/guardrail/scan` with `Authorization: Bearer <vigilnz-api-key>`:

```json
{
  "stage": "input",
  "gateway": "portkey",
  "messages": [{ "role": "user", "content": "..." }],
  "model": "gpt-4o-mini",
  "provider": "openai",
  "redact": false
}
```

Response:

```json
{
  "action": "allow",
  "stage": "input",
  "decision": "ALLOW",
  "reason": "No policy violation detected",
  "threats": [],
  "modified_content": null,
  "enforcement": "enforce",
  "scan_id": "req-1",
  "latency_ms": 42,
  "fail_closed": false
}
```

Output-stage calls send `text` instead of `messages`.

The wire client (`client.ts`) and wire types (`types.ts`) are deliberately free of Portkey
types so the same Vigilnz contract can back adapters for other gateways; `aiSecure.ts` is
the only Portkey-specific file.

## Tests

```
npx jest plugins/vigilnz
```

All Vigilnz calls are mocked — the suite needs no credentials and no network access.
