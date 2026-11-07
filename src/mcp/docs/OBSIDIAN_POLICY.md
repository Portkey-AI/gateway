# Obsidian Policy Enforcement for the MCP Gateway

The MCP gateway can defer **access decisions on MCP tool calls** to the
[Obsidian Security](https://docs.obsidiansecurity.com) Policy Engine. For each
`tools/call` on an enabled server, the gateway asks Obsidian for a verdict
before the tool runs, and again on the result before it is returned to the
client.

This uses Obsidian's **Unified Evaluation API**
(Realtime Enforcement). It is an **Early Access** feature, available to enrolled
organizations in the **US region** only. For anything specific to setting up
Obsidian itself, follow [Obsidian's documentation](#obsidian-documentation);
this page covers what is specific to this gateway.

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Obsidian setup](#obsidian-setup)
- [Gateway configuration](#gateway-configuration)
- [Behaviour reference](#behaviour-reference)
- [Observability](#observability)
- [Security and data handling](#security-and-data-handling)
- [Limitations](#limitations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
MCP client ──tools/call──► Gateway
                             │ 1. static allow/block lists, access control (existing)
                             │ 2. PreToolUse ──► Obsidian ──► pass | warn | block
                             │      block ──► JSON-RPC error -32003, upstream never called
                             │ 3. call upstream MCP server
                             │ 4. PostToolUse (the result) ──► Obsidian ──► pass | warn | block
                             │      block ──► result withheld, JSON-RPC error -32003
                             ▼ 5. result returned to client
```

| Obsidian `decision` | Gateway action                                              |
| ------------------- | ----------------------------------------------------------- |
| `pass`              | Allow                                                       |
| `warn`              | Allow (Obsidian records the match in its event log)         |
| `block`             | Deny                                                        |
| anything else       | Deny, even if the server is fail-open (Obsidian did answer) |

If Obsidian cannot give a verdict, the server's **fail mode** decides. See
[Behaviour reference](#behaviour-reference).

The integration is **off by default** and enabled per server. Servers without
`policy.obsidian.enabled` behave exactly as before and never contact Obsidian.

---

## Quick start

1. Complete the [Obsidian setup](#obsidian-setup) (registration,
   a runtime extension, and policies).
2. Set the gateway environment (see [Environment variables](#environment-variables)):

   ```bash
   export OBSIDIAN_GATEWAY_TOKEN=...            # the gateway token, not the setup token
   export OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE=acme.mcp_gateway   # optional
   export OBSIDIAN_RUNTIME_EXTENSION_VERSION=1                    # optional, string
   ```

3. Enable it on a server in `servers.json`
   (full example: [`examples/servers.obsidian.example.json`](examples/servers.obsidian.example.json)):

   ```json
   {
     "servers": {
       "my-workspace/github": {
         "url": "https://mcp.example.com/mcp",
         "headers": {},
         "policy": { "obsidian": { "enabled": true } }
       }
     }
   }
   ```

4. Start the gateway (Node **24** is required, see [Testing](#testing)):

   ```bash
   SERVERS_CONFIG_PATH=./data/servers.json npx tsx src/start-server.ts --mcp-node
   ```

   Start with `--llm-node --mcp-node` to also run the LLM gateway in the same
   process, which is what exposes the metrics endpoint
   ([Observability](#observability)). Note that despite a comment in
   `start-server.ts`, with no flags only the LLM gateway starts.

Roll out with Obsidian policies set to **`warn`** first, review the matches in
Obsidian's event log, then promote policies to `block` one at a time.

---

## Obsidian setup

Obsidian-specific setup (enrollment, tokens, registering the gateway, runtime
extensions, writing policies) is owned and documented by Obsidian, and the
Unified Evaluation API is in Early Access, so its details can change. **Follow
Obsidian's documentation for each step below**, and use this page for the values
that are specific to this gateway.

### Obsidian documentation

Obsidian's documentation is at <https://docs.obsidiansecurity.com/>. Search it for
the topics named in the table below (for example *Unified Evaluation*,
*Realtime Enforcement API* and *API Tokens*).

> Obsidian's documentation requires signing in: open it from the book icon in
> your Obsidian portal. Without a session the pages show "Session Expired".
> Hosts and regions are listed on the REST API page of those docs; this gateway
> uses the US evaluation host by default (`OBSIDIAN_ENDPOINT`).

### What to do, and what is specific to this gateway

| # | Do this in Obsidian | Follow | Gateway-specific values |
| - | ------------------- | ------ | ----------------------- |
| 1 | **Enroll your organization** in the Early Access (US region). Until then evaluation calls and `unified` policy saves are rejected | Unified Evaluation: *Prerequisites* | none |
| 2 | **Create two API tokens**: a *setup* token and a *gateway* token | API Tokens; Unified Evaluation: *Prerequisites* | See [Two tokens](#two-tokens) |
| 3 | **Register the gateway** as an agent telemetry source | Unified Evaluation: *Step 1* | `platformId: "unified"`, `monitoringMethod: "unified_evaluate"`, `tokenName`: the name of your gateway token |
| 4 | *(Optional)* **Register a runtime extension** | Unified Evaluation: *Step 2* | The keys in [Runtime extension](#runtime-extension) |
| 5 | **Write policies** | Unified Evaluation: *Step 3*; Realtime Enforcement API: *Policy Structure*; Runtime Policies | `app: "unified"`; see [Policies for the gateway](#policies-for-the-gateway) |
| 6 | **Verify** in the event log | Realtime Enforcement API: *Query the event log* | See [Verify](#verify) |

### Two tokens

| Token             | Used for                                              | Permission (per Obsidian's docs) |
| ----------------- | ----------------------------------------------------- | -------------------------------- |
| **Setup token**   | Registrations and policies. Used by you, **not** the gateway | A custom role that includes **Manage agentic AI data** |
| **Gateway token** | Sent by the gateway on every evaluation call (`OBSIDIAN_GATEWAY_TOKEN`) | Obsidian says an *agent telemetry* token is enough. Confirm the exact role with Obsidian. It should **not** include Manage agentic AI data |

Keep them separate so a token stored on gateway hosts can't change your
policies.

### Runtime extension

A runtime extension carries gateway context that policies can match on. The
gateway sends these keys in `runtime_extension.data`; describe them in your
extension's `json_schema`, and list under `required` the keys your policies
depend on (for example `workspace_id`, `server_id`):

| Key               | Value                                             |
| ----------------- | ------------------------------------------------- |
| `workspace_id`    | Workspace from the server config                  |
| `server_id`       | MCP server id                                     |
| `auth_type`       | `api_key`, or `oauth` for OAuth tokens            |
| `organisation_id` | From the token, when present (omitted otherwise)  |

After Obsidian returns the registered `version` (a string, `"1"` the first
time), set the gateway's `OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE` and
`OBSIDIAN_RUNTIME_EXTENSION_VERSION` to that namespace and version.

> Obsidian accepts **only the newest version** and rejects data that doesn't
> match the schema. A schema change is a new registration with the next
> version, after which you must update `OBSIDIAN_RUNTIME_EXTENSION_VERSION`.
> Do not set the extension variables before registering, or every call fails
> with `400 unregistered_runtime_extension`.

Skip this if policies only need the tool name, arguments and result: leave both
extension variables unset.

### Extended context

With `OBSIDIAN_EXTENDED_CONTEXT=true` the gateway also sends `agent.name` and
these `runtime_extension.data` keys (the keys need a registered runtime
extension, and are omitted when the value is unknown):

| Key                | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `client_name`      | MCP client name from `initialize` (also sent as `agent.name`)      |
| `client_version`   | MCP client version from `initialize`                               |
| `token_scopes`     | `scope`/`scopes` from the token (max 50)                           |
| `token_roles`      | `roles` from the token (max 50)                                    |
| `token_groups`     | `groups` from the token (max 50)                                   |
| `tool_annotations` | The tool's MCP annotations (for example `destructiveHint`)         |

Add the keys to your extension's `json_schema`, register it as the next version
and update `OBSIDIAN_RUNTIME_EXTENSION_VERSION` **before** enabling this, or
every call fails with `400 runtime_extension_schema`. Client info is known only
on the gateway instance that handled `initialize`, and `tool_annotations` only
after the client has called `tools/list` in the same session.

> **Trust these fields accordingly.** `client_name` / `agent.name` and
> `client_version` are **self-reported** by the MCP client in `initialize`: any
> client can claim to be `claude-code`. Use them for telemetry and reporting,
> and use `agent.id` (the OAuth `client_id`, bound to credentials) when a policy
> needs to identify the caller. `tool_annotations` are **asserted by the
> upstream MCP server**, which may be wrong or hostile about `readOnlyHint` /
> `destructiveHint`. Use them only to make a policy stricter, never as the
> reason to allow a call. The token-derived keys (`token_*`) are as trustworthy
> as the token issuer.

### Policies for the gateway

Policies use **`"app": "unified"`** and accept only `block` and `warn` (there is
no `ask`/approval flow). Take field ids from Obsidian's field catalog for your
tenant (`GET /filter-config?platform=unified&event=PreToolUse`), because Obsidian
rejects unknown fields on save. Fields that matter for MCP tool calls:

| Field                | Content                                          |
| -------------------- | ------------------------------------------------ |
| `tool.tool_name`     | The MCP tool name                                |
| `tool.params`        | The tool arguments (read a property with `json_path`) |
| `tool.tool_response` | The tool result (`PostToolUse` only)             |
| `runtime_extension`  | Your extension, read as `$['<namespace>'].data.<key>` |

Example: act on a specific tool, here `delete_repository` (generate ids with
`uuidgen | tr 'A-Z' 'a-z'`):

```json
{
  "id": "<lowercase uuid v4>",
  "name": "Repository deletion through the gateway",
  "app": "unified",
  "enabled": true,
  "action": "warn",
  "reason": "Repository deletion is not allowed through the gateway",
  "event": { "key": { "field": "event" }, "op": "eq", "value": "PreToolUse" },
  "condition": { "op": "eq", "key": { "field": "tool.tool_name" }, "value": "delete_repository" }
}
```

Example: act on tool **results** that look like secrets. An MCP result is
`{"content": [{"type": "text", "text": "…"}]}`, so match inside it with
`json_path`:

```json
{
  "id": "<lowercase uuid v4>",
  "name": "Private key in tool output",
  "app": "unified",
  "enabled": true,
  "action": "warn",
  "reason": "Tool output contains a private key",
  "event": { "key": { "field": "event" }, "op": "eq", "value": "PostToolUse" },
  "condition": {
    "op": "rlike",
    "key": { "field": "tool.tool_response", "json_path": "$.content[0].text" },
    "value": "BEGIN (RSA|EC|OPENSSH) PRIVATE KEY"
  }
}
```

Both examples start as `warn`, which allows the call and records the match.
Change `action` to `block` after reviewing the event log. Create them with
`POST /policy` as described in Obsidian's *Realtime Enforcement API* page.

> The first example's shape (a top-level `event` gate plus a
> `tool.tool_name` condition) was **verified against a live tenant**, including
> `warn` and `block`. The `PostToolUse` / `json_path` example is written from
> Obsidian's documentation and has not been run live. `PostToolUse` conditions
> only see results of tools that actually ran.
>
> Policies apply to **every** `unified` client in your Obsidian organization, not
> just this gateway. In a shared org, make test policies match something unique
> (for example a distinctive tool name) and delete them afterwards. Use
> `POST /policy`, `PUT /policy/{id}` and `DELETE /policy/{id}` for single
> policies. **`PUT /policies` replaces the whole set**, including other teams'
> policies, so avoid it.

### Verify

Call a tool through the gateway, then find the decision in both places:

* **The gateway log** has one line per check, including
  `evaluation_id=…` (see [Gateway logs](#gateway-logs)). A denied call also
  returns it in the error's `data.evaluation_id`.
* **Obsidian's event log** has the same event under that id. Query it with the
  setup token (see *Query the event log* in Obsidian's *Realtime Enforcement API*
  page):

```bash
curl -X POST "https://api.obsec.io/v1/agent-guard/logs/query" \
  -H "Authorization: Bearer $SETUP_TOKEN" -H "Content-Type: application/json" \
  -d '{"search_text": "<tool name or evaluation id>", "limit": 10}'
```

Each row has the event `id` (equal to the gateway's `evaluation_id`), `platform`
(`unified`), `action` (`pass`, `warn` or `block`) and `matchedPolicies`.

---

## Gateway configuration

### Environment variables

| Variable                               | Default                                                          | Description |
| -------------------------------------- | ---------------------------------------------------------------- | ----------- |
| `OBSIDIAN_GATEWAY_TOKEN`               | _unset_                                                          | Bearer token for evaluation calls. **If unset, any server with the policy enabled is fail-mode denied** with "Policy engine is not configured". Accepts a literal value or an absolute file path (Docker/Kubernetes secrets) |
| `OBSIDIAN_ENDPOINT`                    | `https://agent-guard.obsec.io/webhook/unified/v1/enforcement`    | Evaluation endpoint. Override for tests or a regional host |
| `OBSIDIAN_CLIENT_PLATFORM`             | `portkey_oss_gateway`                                            | Name for this gateway: 1-64 of letters, digits, `.`, `_`, `-`. **Reserved names are rejected** (`claudecode`, `codex`, `copilot`, `copilot_studio`, `cursor`, `mcpguard`, `mcp_gateway`, `n8n`, compared ignoring case and `-`/`_`) because Obsidian would evaluate them against another product's policies |
| `OBSIDIAN_TIMEOUT_MS`                  | `2500`                                                           | Per-call timeout, 100-30000 |
| `OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE` | _unset_                                                          | Registered extension namespace. Must be set together with the version |
| `OBSIDIAN_RUNTIME_EXTENSION_VERSION`   | _unset_                                                          | Registered extension version, as a string |
| `OBSIDIAN_EXTENDED_CONTEXT`            | `false`                                                          | Set to `true` to also send `agent.name` and the extra runtime extension keys in [Extended context](#extended-context). Register those keys in your extension schema first |

An invalid value is reported when the first policy check runs, not at startup.
Until fixed, each check on an enabled server is denied (fail-closed) or allowed
(fail-open) with the configuration error as the message, and an error is logged.

### Per-server settings (`policy.obsidian`)

| Setting     | Default                         | Description |
| ----------- | ------------------------------- | ----------- |
| `enabled`   | `false`                         | Turn policy checks on for this server |
| `failMode`  | `"closed"`                      | `"closed"` denies when Obsidian can't answer. `"open"` allows |
| `stages`    | `["PreToolUse","PostToolUse"]`  | Which stages to evaluate. Use `["PreToolUse"]` to skip the result check and save a round trip |
| `timeoutMs` | `OBSIDIAN_TIMEOUT_MS`           | Override for this server |

---

## Behaviour reference

### What the client sees

A denied call returns a JSON-RPC error with code **`-32003`**:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32003,
    "message": "Tool 'delete_repository' was blocked: Repository deletion is not allowed through the gateway",
    "data": {
      "source": "obsidian",
      "stage": "PreToolUse",
      "evaluation_id": "c2a4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f",
      "fail_closed": false
    }
  }
}
```

The message is Obsidian's policy `reason`. When the denial came from the fail
mode, the message says `policy check unavailable (fail-closed): …` and
`fail_closed` is `true`, so users and operators can tell a policy block from an
outage. A denied call does not end the MCP session: later calls proceed.

### When Obsidian cannot decide

| Situation                                              | Counted as       | `closed` (default) | `open` |
| ------------------------------------------------------ | ---------------- | ------------------ | ------ |
| Timeout                                                | `error`          | Deny               | Allow  |
| Network error, HTTP 4xx/5xx, unparseable response      | `error`          | Deny               | Allow  |
| `pass` **without** an `evaluation_id` (not evaluated, for example no policy set yet) | `not_evaluated` | Deny | Allow |
| Gateway token or config missing/invalid                | `error`          | Deny               | Allow  |
| A real `block`, or an unrecognised decision value      | `block`          | Deny               | **Deny** |

Network errors and 5xx are retried once. Timeouts and 4xx responses are never
retried, so a slow Obsidian cannot double the delay on a tool call.

### Identity sent to Obsidian

Identity comes from the **downstream client's own token** for that session,
never from the pooled upstream connection.

| Obsidian field   | Source                                                           |
| ---------------- | ---------------------------------------------------------------- |
| `user.id`        | `user_id`, else `sub`, else `username` from the token           |
| `user.email`     | `email` from the token                                           |
| `agent.id`       | OAuth `client_id` (when present)                                 |
| `session_id`     | The MCP session id                                               |
| `target_service` | The MCP server id                                                |

With the gateway's local OAuth (`client_credentials`) tokens there is no user,
only the client, so policies can match on the agent but not on a person. User
fields are populated when the token carries them (API key or external-IdP
tokens). `agent.name`, when [extended context](#extended-context) is on, is
self-reported by the client and must not be used as an identity.

When a fail-closed denial is caused by an Obsidian error response, the error's
short `error` / `code` / `message` (at most 160 characters) is included in the
JSON-RPC error message sent to the client, so a user can tell an operator what
went wrong (for example `unregistered_runtime_extension`). Tool arguments and
results are never included in error messages.

### Gateway logs

**One line per evaluation** is written to the gateway's console, so you can see
Obsidian's verdict locally without querying Obsidian:

```
[2026-01-01T12:00:00.000Z] [mcp/obsidianPolicy] [INFO] Policy stage=PreToolUse server=echo-server tool=echo decision=pass allowed=true source=verdict evaluation_id=3f2a9c1e-7b4d-4e8a-9d56-1c0b8a7e2f44 duration_ms=280 session=a1b2c3d4
```

| Field           | Meaning |
| --------------- | ------- |
| `stage`         | `PreToolUse` or `PostToolUse` |
| `server`, `tool`| The MCP server id and tool name |
| `decision`      | `pass`, `warn`, `block`, `not_evaluated` or `error` |
| `allowed`       | Whether the gateway let the action proceed |
| `source`        | `verdict` (Obsidian answered) or `fail_mode` (it didn't, and the fail mode decided) |
| `evaluation_id` | The event's id in Obsidian's event log (`-` if Obsidian did not evaluate it) |
| `duration_ms`   | Time spent waiting on Obsidian |
| `session`       | First 8 characters of the MCP session id |
| `fail_mode`     | `closed` or `open`. Only present when `source=fail_mode` |
| `reason`        | JSON-quoted policy message or failure description. Only present when `decision` is not `pass` |

`pass` is logged at **INFO**; `warn`, `block`, `not_evaluated` and `error` at
**WARN**. Tool arguments, tool results and the token are **never** logged.

> **Warning:** the gateway's default log level is **INFO**, but it is **ERROR
> when `NODE_ENV=production`**, which hides these lines. Set `LOG_LEVEL=info` to
> see every evaluation, or `LOG_LEVEL=warn` to see only warnings, blocks and
> failures. Valid levels: `error`, `critical`, `warn`, `info`, `debug`.

Find a decision with, for example:

```bash
grep "Policy stage=" gateway.log                       # every evaluation
grep "Policy stage=" gateway.log | grep "allowed=false"  # everything denied
```

In **standalone mode** the structured tool-call log records (below) are sent to
the Portkey control plane, which isn't configured, so this console line is the
only local record of a verdict.

Tool-call log records (control plane) also gain, per stage (`pre` and `post`):

- `mcp.policy.<stage>.decision`: `pass`, `warn`, `block`, `not_evaluated` or `error`
- `mcp.policy.<stage>.allowed`: boolean
- `mcp.policy.<stage>.evaluation_id`: the event's id in Obsidian's event log

When a `PostToolUse` check denies, the withheld result is **not** logged.

---

## Observability

Two Prometheus metrics are registered on the gateway's default registry:

| Metric                                           | Type      | Description |
| ------------------------------------------------ | --------- | ----------- |
| `mcp_policy_evaluations_total`                   | counter   | Policy evaluations |
| `mcp_policy_evaluation_duration_milliseconds`    | histogram | Time spent waiting on Obsidian. **This is latency added to every checked tool call.** Buckets: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000 ms |

Labels on both:

| Label      | Values                                                              |
| ---------- | ------------------------------------------------------------------- |
| `server`   | MCP server id (bounded by your configuration)                       |
| `stage`    | `PreToolUse`, `PostToolUse`                                         |
| `decision` | `pass`, `warn`, `block`, `not_evaluated`, `error`                   |
| `outcome`  | `allowed`, `denied`                                                 |
| `source`   | `verdict` (Obsidian answered) or `fail_mode` (it didn't, and the fail mode decided) |

Tool names, users and sessions are deliberately **not** labels, to keep
cardinality bounded.

**Where to scrape:** the gateway's existing `/metrics` endpoint on the **LLM
gateway port** (enabled unless `ENABLE_PROMETHEUS=false`). That requires running
the LLM gateway in the same process (`--llm-node --mcp-node`). The MCP app has no
`/metrics` route of its own, so an MCP-only process (`--mcp-node`) records the
metrics but exposes no endpoint.

Useful queries:

```promql
# Denials per second by server
sum by (server) (rate(mcp_policy_evaluations_total{outcome="denied"}[5m]))

# Share of evaluations decided by the fail mode, i.e. Obsidian couldn't answer.
# Sustained non-zero values mean an outage, timeouts or a misconfiguration.
sum(rate(mcp_policy_evaluations_total{source="fail_mode"}[5m]))
  / sum(rate(mcp_policy_evaluations_total[5m]))

# Calls being blocked only because Obsidian is unavailable (fail-closed impact)
sum by (server) (rate(mcp_policy_evaluations_total{source="fail_mode",outcome="denied"}[5m]))

# p95 latency added to tool calls
histogram_quantile(0.95,
  sum by (le, server) (rate(mcp_policy_evaluation_duration_milliseconds_bucket[5m])))

# Evaluations that took longer than the timeout budget allows for
sum(rate(mcp_policy_evaluation_duration_milliseconds_bucket{le="+Inf"}[5m]))
  - sum(rate(mcp_policy_evaluation_duration_milliseconds_bucket{le="2500"}[5m]))
```

Suggested alerts: `source="fail_mode"` above a few percent for 5 minutes (page,
since fail-closed servers are denying calls), and p95 duration approaching
`OBSIDIAN_TIMEOUT_MS`.

---

## Security and data handling

- **Tool arguments and results are sent to Obsidian.** Both can contain
  personal or confidential data. Enable the integration only where your data
  handling terms with Obsidian allow it, and use `stages: ["PreToolUse"]` if you
  don't want results leaving the gateway. Upstream server credentials and the
  gateway token are never included in the payload.
- **Use two tokens.** The gateway token only needs to evaluate and report
  telemetry. Do not put the setup token (which can change policies) on gateway
  hosts.
- **Prefer fail-closed** for anything sensitive. Fail-open means an Obsidian
  outage silently turns enforcement off, and the `source="fail_mode"` metric is
  how you'd notice.
- **Check TLS verification.** Make sure `NODE_TLS_REJECT_UNAUTHORIZED=0` is not
  set in the gateway's environment: it disables certificate checking for every
  HTTPS call, including the one carrying your tool data to Obsidian.
- The evaluation endpoint is a hot-path dependency. Size timeouts for your
  latency budget and monitor the metrics above.

---

## Limitations

- **A `PostToolUse` block withholds the result, but the tool has already run.**
  Any side effect (a write, a message sent) has happened. Use `PreToolUse`
  policies to prevent actions, and `PostToolUse` to control what comes back.
- **`tools/list` is not filtered.** A tool a policy would block is still listed
  and fails only when called.
- **Only `tools/call` is checked.** `resources/read`, `prompts/get` and other
  methods are not evaluated: Obsidian's API describes tool events only.
- **No approval flow.** `unified` policies support only `block` and `warn`.
- **Early Access, US region only.** Behaviour and field names may change.
- **Checks add latency** to every tool call on an enabled server: one round trip
  per stage.

---

## Testing

The MCP tests need **Node 24**. The gateway's `avsc` dependency calls
`SlowBuffer`, which Node 25 removed, so the gateway crashes at startup on newer
Node versions (the Dockerfile uses Node 24).

```bash
npx jest src/mcp --runInBand                              # whole MCP suite
npx jest src/mcp/__tests__/unit/obsidianPolicy             # client unit tests
npx jest src/mcp/__tests__/unit/policyMetrics              # metrics
npx jest src/mcp/__tests__/e2e/obsidian-policy             # end-to-end
```

The end-to-end tests run a real gateway process, a mock upstream MCP server
(`MockMCPServer`) and a mock Obsidian endpoint
(`__tests__/MockObsidianServer.ts`). The mock picks its verdict from the tool
name, so you can exercise every path without an Obsidian tenant:

| Tool name prefix | Mock behaviour                                      |
| ---------------- | --------------------------------------------------- |
| `blocked_`       | `block` with a message                              |
| `warn_`          | `warn`                                              |
| `noeval_`        | `pass` with **no** `evaluation_id` (not evaluated)  |
| `weird_`         | Unrecognised decision (must be treated as `block`)  |
| `slow_`          | Delayed response (timeout testing)                  |
| `error_`         | HTTP 500                                            |
| `badjson_`       | HTTP 200 with an invalid body                       |
| _other_          | `pass`. A `PostToolUse` result containing `SECRET` is blocked |

To point a local gateway at the mock instead of Obsidian, set
`OBSIDIAN_ENDPOINT` to the mock's URL and `OBSIDIAN_GATEWAY_TOKEN` to its token.

Local development without a control plane works with the gateway's built-in
OAuth (`/oauth/register`, `/oauth/token` with `client_credentials`) when
`ALBUS_BASEPATH` is unset; see the note on unscoped tokens in
[`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md).

---

## Troubleshooting

For Obsidian's own error responses and field names, see the *Realtime
Enforcement API* and *Unified Evaluation* pages in
[Obsidian's documentation](https://docs.obsidiansecurity.com/) (sign-in
required).

| Symptom | Likely cause and fix |
| ------- | -------------------- |
| Every call on an enabled server is denied with `Policy engine is not configured` | `OBSIDIAN_GATEWAY_TOKEN` is not set in the gateway's environment |
| Denied with a message naming `OBSIDIAN_CLIENT_PLATFORM`, `OBSIDIAN_TIMEOUT_MS` or `…EXTENSION…` | An invalid environment value. Fix it and restart. See [Environment variables](#environment-variables) |
| `policy check unavailable (fail-closed): … HTTP 401` | Wrong or expired gateway token |
| `… HTTP 400 (unregistered_runtime_extension)` | The extension namespace/version is not registered, or is not the newest version, or the version isn't a string. Update `OBSIDIAN_RUNTIME_EXTENSION_VERSION`, or unset both extension variables |
| `… HTTP 400 (runtime_extension_schema …)` | The data the gateway sends doesn't match your registered schema. Align the schema with the keys listed under [Runtime extension](#runtime-extension) |
| `policy check unavailable (fail-closed): Obsidian did not evaluate the event` | Not enrolled in Early Access, or no policy set exists yet. Complete the registration and policy steps in [Obsidian setup](#obsidian-setup) |
| `timed out after …ms` | Obsidian is slow or unreachable. Check `mcp_policy_evaluation_duration_milliseconds`, raise `OBSIDIAN_TIMEOUT_MS` if appropriate, or set `failMode: "open"` for low-risk servers |
| Policies never match | `app` isn't `unified`, the policy isn't `enabled`, or a field id differs from `GET /filter-config?platform=unified` |
| Nothing at `/metrics` | The LLM gateway isn't running in this process (use `--llm-node --mcp-node`) or `ENABLE_PROMETHEUS=false` |
| Gateway crashes on start with `SlowBuffer is not a constructor` | Node 25 or newer. Use Node 24 |
