# Hopper

Use your Hopper API key with the `hopper` provider and either `gemma-4-31b` or `deepseek-v4.1-flash`.

Start the gateway locally, then send a chat request:

```sh
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-portkey-provider: hopper" \
  -H "Authorization: Bearer $HOPPER_API_KEY" \
  -d '{
    "model": "gemma-4-31b",
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

For streaming, add `"stream": true` to the request body.

Hopper uses `https://api.withhopper.com/v1`; see the [Hopper docs](https://docs.withhopper.com/llm) for the API details.
