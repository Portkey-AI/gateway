# API Adapters

Adapters enable **universal API compatibility** by translating between different API formats at the handler level. This allows any provider to support multiple API formats without per-provider modifications.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Incoming Request                            │
│                    (Responses API / Messages API)                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Adapter Layer                             │
│                                                                     │
│   ┌─────────────────┐              ┌─────────────────┐              │
│   │ responses/      │              │ messages/       │              │
│   │                 │              │                 │              │
│   │ Responses API   │              │ Anthropic       │              │
│   │ → Chat Complete │              │ Messages API    │              │
│   │                 │              │ → Chat Complete │              │
│   └─────────────────┘              └─────────────────┘              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Chat Completions (Unified Format)                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Provider Layer                               │
│     (Transforms Chat Completions → Provider-specific format)        │
│                                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ OpenAI  │ │Anthropic│ │ Groq    │ │ Gemini  │ │ 70+more │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

## How Adapters Work

### Request Flow
1. **Incoming**: Request arrives in a specific API format (e.g., Responses API)
2. **Adapter Transform**: Converts to Chat Completions (unified format)
3. **Provider Transform**: Existing provider logic converts to provider-specific format
4. **Provider Call**: Request sent to the actual provider

### Response Flow
1. **Provider Response**: Response received in provider-specific format
2. **Provider Transform**: Existing provider logic converts to Chat Completions
3. **Adapter Transform**: Converts back to the original API format
4. **Return**: Response sent to client in expected format

## Available Adapters

### `responses/` - OpenAI Responses API Adapter
Enables all 70+ providers to support OpenAI's newer Responses API.

**Files:**
- `requestTransform.ts` - Responses API → Chat Completions
- `responseTransform.ts` - Chat Completions → Responses API
- `streamTransform.ts` - Real-time SSE chunk transformation
- `index.ts` - Exports and native provider detection

**Native Providers** (bypass adapter): `openai`, `azure-openai`

### `messages/` - Anthropic Messages API Adapter
Enables all providers to accept Anthropic's Messages API format.

**Files:**
- `requestTransform.ts` - Messages API → Chat Completions
- `responseTransform.ts` - Chat Completions → Messages API
- `streamTransform.ts` - Real-time SSE chunk transformation
- `index.ts` - Exports and native provider detection

**Native Providers** (bypass adapter): `anthropic`, `bedrock`

## Adding a New Adapter

1. Create a folder: `src/adapters/{api-name}/`
2. Implement transforms:
   - `requestTransform.ts` - Convert incoming format → Chat Completions
   - `responseTransform.ts` - Convert Chat Completions → outgoing format
   - `streamTransform.ts` (if streaming differs)
3. Export from `index.ts`
4. Integrate in the relevant handler

## Design Principles

- **Handler-level integration**: Adapters are applied once at the handler, not per-provider
- **Chat Completions as pivot**: All adapters translate to/from Chat Completions
- **Minimal overhead**: Optimized for low latency and memory usage
- **Native passthrough**: Providers with native support bypass the adapter entirely

## Key Design Decisions

### Reasoning/Thinking Support

**For Chat Completions**: Reasoning data requires `strictOpenAiCompliance: false` because
it's a non-standard Portkey extension (via `content_blocks`).

**For Responses API**: The `reasoning` output item is **part of the standard spec**, not
an extension. Therefore, we:

1. **Force** `strictOpenAiCompliance: false` for the underlying chatComplete call
2. **Always** include reasoning output items if thinking data is present

This means users calling the Responses API automatically get reasoning/thinking data
from any provider that supports it (Anthropic, Google, etc.) without setting any flags.

## Supported Features

### ✅ Fully Supported
- Text input/output
- Multi-turn conversations
- Function tool calls
- Token usage tracking
- Reasoning/thinking output (automatically included when provider returns it)
- Streaming responses (SSE events transformed to Responses API format)

### ❌ Not Supported (Responses API-only features)
- `previous_response_id` state management
- Built-in tools (web_search, file_search, computer_use)
- `input_file` content type

## Provider-Specific Parameters

### Reasoning/Thinking

Different providers have different mechanisms to enable reasoning. The gateway maps
`reasoning.effort` to each provider's native format automatically.

| Provider | Parameter | Mapping |
|----------|-----------|---------|
| OpenAI (o-series) | `reasoning.effort` | Passthrough as `reasoning_effort` |
| Anthropic (Opus 4.5+) | `reasoning.effort` | Mapped to `output_config.effort` |
| Anthropic | `thinking` | Direct passthrough (supports `type: 'enabled'`, `'adaptive'`, `'disabled'`) |
| Google / Vertex AI | `reasoning.effort` | Mapped to `thinking_config` / `thinkingConfig` |

**Note:** For Anthropic, you can use either `reasoning.effort` (mapped to `output_config.effort`)
or the native `thinking` parameter directly. For Claude 4.6+, adaptive thinking
(`thinking: { type: "adaptive" }`) combined with `reasoning.effort` is the recommended approach.
