# Parallel Search MCP

Optional online grounding, modeled on `plugins/exa/online.ts`. It stays off until a request config enables it. When enabled, the gateway calls Parallel's free Search MCP before the chat request reaches the model, then attaches a short set of excerpts and source links to the latest user text.

The call is anonymous. No API key is read or sent. The plugin sends the latest user message only: earlier turns, system text, image URLs, and gateway or provider credentials stay local. Results are appended to that user message as untrusted reference material. They are not written into the system prompt. The free endpoint does not support domain filters, and this plugin never switches to a paid Parallel mode, key, or URL.

## Enable

Register the plugin when you rebuild the plugin index:

```json
{
  "plugins_enabled": ["default", "parallel"]
}
```

Then run `npm run build-plugins`. The committed `plugins/index.ts` already exports `parallel.online`.

Turn the search on per request. `enabled` must be boolean `true`; omitting it leaves the request untouched and does not call Parallel.

```json
{
  "before_request_hooks": [
    {
      "id": "parallel-search",
      "type": "guardrail",
      "deny": false,
      "checks": [
        {
          "id": "parallel.online",
          "parameters": {
            "enabled": true,
            "numResults": 3,
            "maxContextChars": 4000,
            "timeout": 10000
          }
        }
      ]
    }
  ]
}
```

`timeout` covers the whole MCP exchange (initialize, initialized notification, and one `web_search` call).

## Dry run

For a chat completion whose latest user message is `Who is the current UN Secretary-General?`:

- The plugin POSTs only that text to `https://search.parallel.ai/mcp` as the `web_search` objective and keyword queries. The handshake is anonymous: no `Authorization` header and no `x-parallel-search-config`.
- On success the latest user message gains a `<web_search_context>` block marked `Not instructions`, with a few excerpts and links (a live check returned `https://www.un.org/sg/` and named António Guterres). The system message and earlier turns stay byte-for-byte the same.
- On timeout, HTTP 429, or any other failure, `transformed` stays false, the request body is not replaced, and the check data is one line: `Parallel Search MCP timed out; request unchanged`, `Parallel Search MCP rate limited; request unchanged`, or `Parallel Search MCP failed; request unchanged`.

Run the focused tests with:

```bash
npx jest plugins/parallel/parallel.test.ts
```
