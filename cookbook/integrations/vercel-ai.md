## Portkey is the control panel for your Vercel AI app. It makes your LLM integrations prod-ready, reliable, fast, and cost-efficient.

Use Portkey with your Vercel app for:

1. Calling 100+ LLMs (open & closed)
2. Logging & analysing LLM usage
3. Caching responses
4. Automating fallbacks, retries, timeouts, and load balancing
5. Managing, versioning, and deploying prompts
6. Continuously improving app with user feedback

## Guide: Create a Portkey + OpenAI Chatbot

### 1. Create a NextJS app

Go ahead and create a Next.js application, and install `ai` and `portkey-ai` as dependencies.

```sh
pnpm dlx create-next-app my-ai-app
cd my-ai-app
pnpm install ai portkey-ai
```

### 2. Add Authentication keys to `.env`

1. Login to Portkey [here](https://app.portkey.ai/)
2. To integrate OpenAI with Portkey, add your OpenAI API key to Portkey’s Virtual Keys
3. This will give you a disposable key that you can use and rotate instead of directly using the OpenAI API key
4. Grab the Virtual key & your Portkey API key and add them to `.env` file:

```sh
# ".env"
PORTKEY_API_KEY="xxxxxxxxxx"
OPENAI_VIRTUAL_KEY="xxxxxxxxxx"
```

### 3. Create Route Handler

Create a Next.js Route Handler that utilizes the Edge Runtime to generate a chat completion. Stream back to Next.js.

For this example, create a route handler at `app/api/chat/route.ts` that calls GPT-4 and accepts a `POST` request with a messages array of strings:

```ts
// filename="app/api/chat/route.ts"
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { Portkey } from 'portkey-ai';

// Create a Portkey API client
const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.OPENAI_VIRTUAL_KEY
});

// Set the runtime to edge for best performance
export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Call GPT-4
  const response = await portkey.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages
  });

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
```

The Vercel AI SDK provides <code>[OpenAIStream](https://sdk.vercel.ai/docs/api-reference/providers/openai-stream)</code> function that decodes the text tokens in the <code>response</code> and encodes them properly for simple consumption. The <code>[StreamingTextResponse](https://sdk.vercel.ai/docs/api-reference/streaming-text-response)</code> class utility extends the Node/Edge Runtime <code>Response</code> class with default headers.

Portkey follows the same signature as OpenAI SDK but extends it to work with **100+ LLMs**. Here, the chat completion call will be sent to the `gpt-4` model, and the response will be streamed to your Next.js app.

### 4. Switch from OpenAI to Anthropic

Portkey is powered by an [open-source, universal AI Gateway](https://github.com/portkey-ai/gateway) with which you can route to 100+ LLMs using the same, known OpenAI spec.

Let’s see how you can switch from GPT-4 to Claude-3-Opus by updating 2 lines of code (without breaking anything else).

1. Add your Anthropic API key or AWS Bedrock secrets to Portkey’s Virtual Keys
2. Update the virtual key while instantiating your Portkey client
3. Update the model name while making your `/chat/completions` call

Let’s see it in action:

```tsx filename="app/api/chat/route.ts"
// Set the runtime to edge for best performance
export const runtime = 'edge';

// Create a Portkey API client
const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.ANTHROPIC_VIRTUAL_KEY
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Switch from GPT-4 to Claude-3-Opus
  const response = await portkey.chat.completions.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 512
    stream: true,
    messages
  });

  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
```

### 5. Switch to Gemini 1.5

Similarly, you can just add your [Google AI Studio API key](https://aistudio.google.com/app/) to Portkey and call Gemini 1.5:

```tsx
const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.GOOGLE_VIRTUAL_KEY
});
  const response = await portkey.chat.completions.create({
    model: 'gemini-1.5-pro-latest,
    stream: true,
    messages
  });
```

The same will follow for all the other providers like **Azure**, **Mistral**, **Anyscale**, **Together**, and more.

### 6. Wire up the UI

Let's create a Client component that will have a form to collect the prompt from the user and stream back the completion. The `useChat` hook will default use the `POST` Route Handler we created earlier (`/api/chat`). However, you can override this default value by passing an `api` prop to useChat(`{ api: '...'}`).

```tsx
//"app/page.tsx"
'use client';

import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();
  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((m) => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
```

### 7. Log the Requests

Portkey logs all the requests you’re sending to help you debug errors, and get request-level + aggregate insights on costs, latency, errors, and more.

You can enhance the logging by tracing certain requests, passing custom metadata or user feedback.

![rolling logs and cachescreents](https://portkey.ai/blog/content/images/2024/04/logs.gif)

**Segmenting Requests with Metadata**

On Portkey, while making a `chat.completions` call, you can pass any `{"key":"value"}` pairs. Portkey segments the requests based on the metadata to give you granular insights.

```tsx
const response = await portkey.chat.completions.create(
  {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'How do I optimise auditorium for maximum occupancy?' }]
  },
  {
    metadata: {
      user_name: 'john doe',
      organization_name: 'acme'
    }
  }
);
```

Learn more about [tracing](https://portkey.ai/docs/product/observability-modern-monitoring-for-llms/traces) and [feedback](https://portkey.ai/docs/product/observability-modern-monitoring-for-llms/feedback).

## Guide: Handle OpenAI Failures

### 1. Solve 5xx, 4xx Errors

Portkey helps you automatically trigger a call to any other LLM/provider in case of primary failures.<br>
[Create](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/configs) a fallback logic with Portkey’s Gateway Config.

For example, for setting up a fallback from OpenAI to Anthropic, the Gateway Config would be:

```json
{
  "strategy": { "mode": "fallback" },
  "targets": [{ "virtual_key": "openai-virtual-key" }, { "virtual_key": "anthropic-virtual-key" }]
}
```

You can save this Config in Portkey app and get an associated Config ID that you can pass while instantiating your Portkey client:

### 2. Apply Config to the Route Handler

```tsx
const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  config: 'CONFIG_ID'
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const response = await portkey.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages
  });

  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
```

### 3. Handle Rate Limit Errors

You can loadbalance your requests against multiple LLMs or accounts and prevent any one account from hitting rate limit thresholds.

For example, to route your requests between 1 OpenAI and 2 Azure OpenAI accounts:

```json
{
  "strategy": { "mode": "loadbalance" },
  "targets": [
    { "virtual_key": "openai-virtual-key", "weight": 1 },
    { "virtual_key": "azure-virtual-key-1", "weight": 1 },
    { "virtual_key": "azure-virtual-key-2", "weight": 1 }
  ]
}
```

Save this Config in the Portkey app and pass it while instantiating the Portkey client, just like we did above.

Portkey can also trigger [automatic retries](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries), set [request timeouts](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts), and more.

## Guide: Cache Semantically Similar Requests

Portkey can save LLM costs & reduce latencies 20x by storing responses for semantically similar queries and serving them from cache.

For Q&A use cases, cache hit rates go as high as 50%. To enable semantic caching, just set the `cache` `mode` to `semantic` in your Gateway Config:

```json
{
  "cache": { "mode": "semantic" }
}
```

Same as above, you can save your cache Config in the Portkey app, and reference the Config ID while instantiating the Portkey client.

Moreover, you can set the `max-age` of the cache and force refresh a cache. See the [docs](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/cache-simple-and-semantic) for more information.

## Guide: Manage Prompts Separately

Storing prompt templates and instructions in code is messy. Using Portkey, you can create and manage all of your app’s prompts in a single place and directly hit our prompts API to get responses. Here’s more on [what Prompts on Portkey can do](https://portkey.ai/docs/product/prompt-library).

To create a Prompt Template,

1. From the Dashboard, Open **Prompts**
2. In the **Prompts** page, Click **Create**
3. Add your instructions, variables, and You can modify model parameters and click **Save**

![verel app prompt](https://raw.githubusercontent.com/Portkey-AI/portkey-cookbook/a358363e2102df4ff7657e56cc592f4e861f9d6c/integrations/images/vercel-portkey-guide/2-vercel-portkey-guide.png)

### Trigger the Prompt in the Route Handler

```js
const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY
});

export async function POST(req: Request) {
  const { variable_content } = await req.json();

  const response = await portkey.prompts.completions.create({
    promptID: 'pp-vercel-app-f36a02',
    variables: { variable_name: 'variable_content' }, // string
    stream: true
  });

  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
```

See [docs](https://portkey.ai/docs/api-reference/prompts/prompt-completion) for more information.

## Talk to the Developers

If you have any questions or issues, reach out to us on [Discord here](https://portkey.ai/community). On Discord, you will also meet many other practitioners who are putting their Vercel AI + Portkey app to production.
