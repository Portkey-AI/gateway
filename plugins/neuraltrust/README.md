# NeuralTrust TrustGuard

Portkey plugin that sends chat, completion, and Anthropic Messages traffic to TrustGuard `POST /v1/evaluate`.

Check id is `neuraltrust.evaluate`. It runs on both `beforeRequestHook` and `afterRequestHook`. Put credentials on `checks[].parameters.credentials`. Do not put them in `conf.json`, and do not run `npm run build-plugins` to register this plugin — that command regenerates `plugins/index.ts` from `plugins_enabled` and drops plugins that are only hand-registered.

```json
{
  "before_request_hooks": [
    {
      "type": "guardrail",
      "id": "trustguard",
      "deny": true,
      "checks": [
        {
          "id": "neuraltrust.evaluate",
          "parameters": {
            "credentials": {
              "apiKey": "tgk_...",
              "collectorKey": "tgcol_..."
            },
            "timeout": 5000
          }
        }
      ]
    }
  ],
  "after_request_hooks": [
    {
      "type": "guardrail",
      "id": "trustguard",
      "deny": true,
      "checks": [
        {
          "id": "neuraltrust.evaluate",
          "parameters": {
            "credentials": {
              "apiKey": "tgk_...",
              "collectorKey": "tgcol_..."
            },
            "timeout": 5000
          }
        }
      ]
    }
  ]
}
```

`apiKey` is required. `collectorKey` is optional when the API key is already bound to a collector. `apiBase` defaults to `https://trustguard.neuraltrust.ai`.

## Verdicts

TrustGuard `allow` is `verdict: true`. `report` is also `verdict: true`, with findings in `data` so they show up in `hook_results` without blocking. `block` is `verdict: false`. Pair that with hook-level `deny: true` to get HTTP 446 and skip the provider, or `deny: false` to get HTTP 246 with the model content intact.

`transform` is `verdict: true` and `transformed: true`. `transformed_payload.messages` is written back with the same request type it came from: chat `messages`, completion `prompt`, or Anthropic `messages` plus top-level `system`. `transformed_payload.input` redacts the current string (or single text part). An empty, shorter, or unusable transform fails closed even if `unreachableFallback` is `fail_open`.

## Fail closed

Portkey's default is fail-open: an errored check is forgiven unless `failOnError` is true. An unreachable TrustGuard would otherwise let traffic through. This plugin fails closed by returning `verdict: false` with `error` left null, so the engine cannot forgive it. Unexpected throws inside the handler take the same path.

Auth failures (401/403), HTTP 503 entitlements, unknown verdicts, invalid JSON on HTTP 200, and empty transforms always take that path.

Connect errors, timeouts, and HTTP 502/504 follow `unreachableFallback`. The default is `fail_closed`. Set `unreachableFallback` to `fail_open` to restore Portkey house style: `verdict` is still false, but `error` is set, so the engine lets the request through unless the check also sets `failOnError: true`.

## Limitations

Before-request still runs on streamed calls. After-request receives `response.json === null` and cannot deny or redact. The handler returns `verdict: true` and does not call TrustGuard. Same limitation as other Portkey guardrail plugins.

Unrecognized `requestType` values (including `embed`) are treated as nothing to check.

Only `choices[0]` is scanned or rewritten. Additional completion choices from `n > 1` are left as-is, matching Portkey's shared content helpers.

A single-string `transformed_payload.input` cannot cover multi-part message content, array completion prompts, or Anthropic `tool_use` / `thinking` blocks. Those require a `messages` transform or the check fails closed.

## Tests

`npx jest plugins/neuraltrust` mocks `utils.post`. Drop a gitignored `.creds.json` next to this README to enable the optional live suite:

```json
{
  "apiKey": "tgk_...",
  "collectorKey": "tgcol_..."
}
```
