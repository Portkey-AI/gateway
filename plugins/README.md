`PluginContext` should contain the following keys

```json
{
  "hookType": "beforeRequestHook", // or `afterRequestHook`
  "request": {
    // The raw body of the incoming request
    "body": {},
    // Processed text by extracting the prompt or messages and putting them together
    "text": ""
  },
  "response": {
    // The raw body of the outgoing response
    "body": {},
    // Processed text by extracting the choices or messages and putting them together
    "text": ""
  },
}
```

Todos
- Do plugin function evaluations support default values?
- Plugins should handle finding the text
- Plugins before being called should check if they support that particular hook type or should be skipped.
- Will need to support enum names
- Tools need to be supported on Portkey