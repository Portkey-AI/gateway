# Switchyard in the Node gateway

This spike uses Portkey's `2.0.0` branch at
`8febc1dc1d85053dd374922e547b4db1af0fab79`. Its package version is `2.2.3`.

Switchyard runs the routing algorithm. Portkey makes the model calls using its
existing credentials, permissions, hooks, retries, logging, and HTTP clients.
Requests use the existing Chat Completions, Responses, and Messages endpoints,
including streaming. Switchyard handles conversion between those formats.

## Enable it

Use Node 22.19 or newer and build the companion Switchyard TypeScript package.
The `AlgorithmRouter` binding used here is still unpublished development code. It
must be available locally as `@switchyard/libsy`; this spike does not add a
published dependency or change Portkey's lockfile.

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
must have an explicit model. Switchyard's existing `AlgorithmSpec` parser checks
the algorithm configuration. The optional `strategy.switchyard.formats` map
sets a target's wire format; its default is `openai_chat`.

## Current limits

- This is a Node integration. The Workers and MCP services do not load it.
- Simple caching is supported. Semantic caching is rejected because its current
  vector lookup does not provide the same credential-level isolation.
- The custom `openai_decisions` and `system_one` judge endpoints use Portkey's
  proxy transport, but its existing pricing code does not count their token
  usage. Portkey token and cost budgets therefore do not fully cover those
  calls. Standard Chat, Responses, and Messages calls use their existing
  accounting paths. Custom judge metering needs a separate follow-up.
- Up to 64 native routers are retained per process. Routing and Responses
  continuation state can be lost on eviction, restart, or another gateway replica.
- Cancellation reaches the normal HTTP transports and retry waits. An existing
  provider SDK or hook that ignores cancellation can continue its own work.
- Targets are resolved provider entries. Nested target strategies inside a
  Switchyard group are not supported.

## Local validation

```sh
npx tsx --test tests/integration/switchyard.test.ts
npm run build
npx tsc --noEmit
```

All 29 focused tests pass. The suite uses the real Portkey auth middleware, the native
Switchyard library, and local control-plane and provider fixtures. They cover
all three APIs, streaming, policy refusals, hooks, cancellation, retries,
continuations, and cache isolation, including different credentials within one
route. A separate compiled-server smoke test also
checked client disconnects before an answer and during streaming. No paid
provider or hosted Portkey control-plane calls were made.

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
