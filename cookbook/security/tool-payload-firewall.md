# Block unsafe agent tool payloads with a local firewall

Autonomous agents often leave the model gateway through tool calls: Stripe refunds,
CRM updates, email sends, database writes, or internal admin APIs. Content
guardrails help at the prompt and response layer, but tool-call arguments need a
structural check before the application executes them.

The `tool-payload-firewall` plugin adds a local guardrail for OpenAI-compatible
`tool_calls`. It flattens tool-call arguments into JSON paths, applies allowlist,
blocked path, string length, and array size policies, then returns audit-ready
findings in the hook result.

## Example

Enable the plugin in `conf.json`:

```json
{
  "plugins_enabled": ["default", "tool-payload-firewall"],
  "credentials": {}
}
```

Build plugins:

```bash
npm run build-plugins
```

Add the guardrail as an `after_request_hooks` policy so the gateway inspects the
model's proposed tool calls before your agent executes them:

```json
{
  "after_request_hooks": [
    {
      "id": "agent-tool-payload-policy",
      "type": "guardrail",
      "deny": true,
      "checks": [
        {
          "id": "tool-payload-firewall.scan",
          "parameters": {
            "allowedToolNames": ["lookup_customer", "create_refund"],
            "blockedPaths": ["customer.ssn", "*.api_key", "recipients.*.email"],
            "maxArrayItems": 25,
            "maxStringLength": 2048
          }
        }
      ]
    }
  ]
}
```

## Why this helps agent reliability

- `blockedPaths` catches sensitive or high-risk arguments such as `customer.ssn`
  or `*.api_key` even when they appear inside otherwise valid JSON.
- `maxArrayItems` limits accidental mass updates and runaway API calls from
  manipulated tool arguments.
- `maxStringLength` catches prompt-injection payloads hidden in fields such as
  `notes`, `description`, or `instructions`.
- `allowedToolNames` prevents a model from escalating from retrieval tools into
  write tools unless the route explicitly allows them.

For teams running evals, the same policy can be used as a regression oracle:
replay historical tool traces through the gateway and assert that risky payload
shapes produce deterministic `hook_results` findings before rollout.
