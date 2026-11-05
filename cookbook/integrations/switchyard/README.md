# Switchyard in the Node gateway

This spike uses Portkey's `2.0.0` branch at
`8febc1dc1d85053dd374922e547b4db1af0fab79`. Its package version is `2.2.3`.

Switchyard runs the routing algorithm. Portkey makes the model calls using its
existing credentials, permissions, hooks, retries, logging, and HTTP clients.
Buffered requests use the existing Chat Completions, Responses, and Messages
endpoints. Switchyard handles conversion between those formats. The gateway
drives the same routing steps exposed by Switchyard's Python bindings.

## Enable it

Use Node 22.19 or newer and build the companion Switchyard TypeScript package.
The Python-aligned `AlgorithmFactory`, `runStream`, and `TranslationEngine`
bindings used here are unpublished development code. Make that build available
locally as `@switchyard/libsy`. A published dependency and lockfile update are
still needed before merge.

For local testing, link the built package from the gateway checkout:

```sh
mkdir -p node_modules/@switchyard
ln -s /absolute/path/to/switchyard/bindings/typescript node_modules/@switchyard/libsy
```

Keep the normal Portkey control-plane and authentication setup. Start its LLM
Node service with:

```sh
SWITCHYARD_ENABLED=true npm run dev:node -- --llm-node --port=8787
```

The flag lets the deployment load the native backend. A route selects Switchyard
through its normal Portkey configuration:

```json
{
  "strategy": {
    "mode": "switchyard",
    "switchyard": {
      "algorithm": { "type": "passthrough", "target": "fast" }
    }
  },
  "targets": [
    {
      "name": "fast",
      "provider": "openai",
      "api_key": "YOUR_PROVIDER_KEY",
      "override_params": { "model": "YOUR_MODEL" }
    }
  ]
}
```

Send this through Portkey's usual config mechanism, such as `x-portkey-config`,
alongside a valid Portkey API key. Target names must be unique and each target
must have an explicit model. The gateway maps these entries to an
`AlgorithmFactory` deployment and reuses the configured algorithm across requests.
Algorithm settings must be TOML-compatible; omit optional settings instead of
setting them to JSON null. Provider credentials and calls stay in Portkey.
The optional `strategy.switchyard.formats` map selects `openai_chat` (default),
`openai_responses`, or `anthropic_messages` for each target.

## Current limits

- This is a Node integration. The Workers and MCP services do not load it.
- Simple caching is supported. Semantic caching is rejected because its current
  vector lookup does not provide the same credential-level isolation.
- HTTP streaming and Responses continuation (`previous_response_id` or
  `conversation`) are rejected before provider calls. This adapter has no
  continuation ownership store.
- Chat-based model judges are supported. Decision-call routing and the custom
  Decisions/SystemOne wire transports are not supported in this draft.
- Routing-time model calls use only their first candidate.
- Up to 64 configured algorithms are retained per process. Algorithm-owned
  session state can be lost on eviction, restart, or another gateway replica.
- Cancellation closes the routing iterator and aborts its HTTP calls. A provider
  SDK or hook that ignores its signal can continue its own work.
- Targets are resolved provider entries. Nested target strategies inside a
  Switchyard group are not supported.

## Local validation

```sh
npx tsx --test tests/integration/switchyard.test.ts
npm run build
npx tsc --noEmit
```

The suite uses real Portkey authentication, the native Switchyard binding, and
local control-plane and provider fixtures. It checks buffered format conversion,
judge and answer calls, policy refusals, hooks, cancellation, routing deadlines,
context fallback, and credential-scoped caching. These tests make no paid
provider calls.

The upstream checkout has setup problems independent of this integration:

- `npm ci` fails on missing `snappy` lockfile entries. Testing used an untracked
  install with `--package-lock=false --legacy-peer-deps --ignore-scripts`, then
  applied the repository's existing patches. The async-retry types patch needs
  `@types/async-retry@1.4.5` in that local install.
- The Akto plugin lives under `plugins/akto`, but the app imports it from
  `src/plugins/akto`. Testing used these temporary local links:

  ```sh
  ln -s ../../plugins/akto src/plugins/akto
  ln -s ../src/plugins/types.ts plugins/types.ts
  ln -s ../src/plugins/utils.ts plugins/utils.ts
  ```

- With the same local setup, the clean baseline and this implementation both
  report 127 TypeScript errors with matching diagnostics. Neither passes a full
  typecheck. Both build with warnings; the integration adds no new type errors.

Those setup fixes and native package distribution still need to be settled
before this is ready to merge.
