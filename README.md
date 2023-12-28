<!-- <img src="docs/images/header_new.png" width=2000> -->
<div align="center">
<img src="https://github.com/roh26it/Rubeus/assets/971978/50b9f1df-ff5b-43d4-91be-b817943a16f7" width=500>
</div>
<!-- ![image](https://github.com/roh26it/Rubeus/assets/971978/50b9f1df-ff5b-43d4-91be-b817943a16f7) -->

# AI Gateway

<div align="centerc">

<!-- ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white) -->
<!-- ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) -->
[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges?style=for-the-badge)](./LICENSE)
![Discord](https://img.shields.io/discord/1143393887742861333?style=for-the-badge)
![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/portkeyai?style=for-the-badge&logo=Twitter)
<!-- ![Static Badge](https://img.shields.io/badge/dev_to-Follow?style=for-the-badge&logo=devdotto) -->



<!--[![npm version](https://badge.fury.io/js/rubeus.svg)](https://badge.fury.io/js/rubeus)
[![Build Status](https://travis-ci.com/yourusername/rubeus.svg?branch=master)](https://travis-ci.com/yourusername/rubeus)
[![Coverage Status](https://coveralls.io/repos/github/yourusername/rubeus/badge.svg?branch=master)](https://coveralls.io/github/yourusername/rubeus?branch=master)
 -->

</div>

### Route to 100+ LLMs with 1 fast & friendly API.

[Portkey's AI Gateway](https://portkey.ai/features/ai-gateway) is the interface between your app and hosted LLMs. It streamlines API requests to OpenAI, Anthropic, Mistral, LLama2, Anyscale, Google Gemini and more with a unified API. 

- [x] Blazing **fast** (9.9x faster) with a **tiny footprint** (~45kb installed)
- [x] **Load balance** across multiple models, providers, and keys
- [x] **Fallbacks** make sure your app stays resilient
- [x] **Automatic Retries** with exponential fallbacks come by default
- [x] Plug-in middleware as needed

## Getting Started
### Installation
If you're familiar with Node.js and `npx`, you can run your private AI gateway locally. ([Other deployment options](#deploying-rubeus))
```bash
npx @portkey-ai/gateway
```
> Your AI Gateway is now running on http://localhost:8787 🚀
### Usage
Lets try making a **chat completions** call to OpenAI through the AI gateway:
```bash
curl '127.0.0.1:8787/v1/chat/completions' \
  -H 'x-portkey-provider: openai' \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"messages": [{"role": "user","content": "Say this is test."}], "max_tokens": 20, "model": "gpt-4"}'
```
**Using the OpenAI Node.js SDK**
```js
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'OPENAI_API_KEY', // defaults to process.env["OPENAI_API_KEY"],
  baseURL: "http://127.0.0.1:8787", // The AI gateway's URL
  defaultHeaders: { 'x-portkey-provider': "openai" }
});

const chatCompletion = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Say this is a test' }],
  model: 'gpt-3.5-turbo'
});

console.log(chatCompletion.choices);
```
**Using the OpenAI Python SDK**
```py
from openai import OpenAI

client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url="http://127.0.0.1:8787", # The AI gateway's URL
    default_headers={"x-portkey-provider": "openai"}
)

chat_completion = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Say this is a test."}],
)

print(chat_completion.choices)
```
[Full list of supported SDKs](#sdks-supported)

<br>


## Supported Providers

|| Provider  | Support Status  | Supported Endpoints |
|---|---|---|---|
| <img src="docs/images/openai.png" width=18 />| OpenAI | ✅ Supported  | `/completion`, `/chat/completions`,`/embed`, `/assistants`, `/threads`, `/runs`, `streaming` |
| <img src="docs/images/azure.png" width=18>| Azure OpenAI | ✅ Supported  | `/completion`, `/chat/completions`,`/embed`, `streaming` |
| <img src="docs/images/anyscale.png" width=18>| Anyscale | ✅ Supported  | `/chat/completions`, `streaming` |
| <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" width=18>| Google Gemini & Palm | ✅ Supported  | `/generateMessage`, `/generateText`, `/embedText`, `streaming` |
| <img src="docs/images/anthropic.png" width=18>| Anthropic  | ✅ Supported  | `/messages`, `/complete`, `streaming` |
| <img src="docs/images/cohere.png" width=18>| Cohere  | ✅ Supported  | `/generate`, `/embed`, `/rerank`, `streaming` |
| <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" width=18>| Together AI  | ✅ Supported  | `/chat/completions`, `/completions`, `/inference`, `streaming` |

> [View the complete list of 100+ supported models here](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br />

## Configs
The AI gateway supports [configs](https://portkey.ai/docs/api-reference/config-object) to enable **fallbacks**, **load balancing**, **retries** and more.
<br><br>Here's an example config that **retries** an OpenAI request 5 times before **falling back** to Gemini Pro
```js
{
  "retry": { "count": 5 },
  "strategy": { "mode": "fallback" },
  "targets": [{
      "provider": "openai",
      "api_key": "sk-***"
    },{
      "provider": "google",
      "api_key": "gt5***",
      "override_params": {"model": "gemini-pro"}
  }]
}
```
This config would enabled **load balancing** equally between 2 OpenAI keys
```js
{
  "strategy": { "mode": "loadbalance" },
  "targets": [{
      "provider": "openai",
      "api_key": "sk-***",
      "weight": "0.5"
    },{
      "provider": "openai",
      "api_key": "sk-***",
      "weight": "0.5"
    }
  ]
}
```

You can then use these configs while making the OpenAI call through the `x-portkey-config` header
```js
const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787", // The rubeus server URL
  defaultHeaders: {
    'x-portkey-config': {.. your config here ..}, 
  }
});
```
> Read more about the [config object](https://portkey.ai/docs/api-reference/config-object).
<br>

## SDKs Supported

| Language | Supported SDKs |
|---|---|
| Node.js / JS / TS | [Portkey SDK](https://www.npmjs.com/package/portkey-ai) <br> [OpenAI SDK](https://www.npmjs.com/package/openai) <br> [LangchainJS](https://www.npmjs.com/package/langchain) <br> [LlamaIndex.TS](https://www.npmjs.com/package/llamaindex) |
| Python | [Portkey SDK](https://pypi.org/project/portkey-ai/) <br> [OpenAI SDK](https://pypi.org/project/openai/) <br> [Langchain](https://pypi.org/project/langchain/) <br> [LlamaIndex](https://pypi.org/project/llama-index/) |
| Go | [go-openai](https://github.com/sashabaranov/go-openai) |
| Java | [openai-java](https://github.com/TheoKanning/openai-java) |
| Rust | [async-openai](https://docs.rs/async-openai/latest/async_openai/) |
| Ruby | [ruby-openai](https://github.com/alexrudall/ruby-openai) |

<br>

## Performance
The AI Gateway was built internally at [Portkey](https://portkey.ai) and has been live in production since September 2023. It is actively maintained by Portkey with participation from open source contributors.
- It has been battle **tested over 100B tokens** processed till December '23
- It processes over **10M requests every day** and has been load tested for 1M rps
- It is built on top of the very fast [Hono](https://hono.dev) router which is **9.9x faster** than the standard express router.
<br>

## Deploying Rubeus
* Deploy using Docker
* Deploy on Vercel
* Deploy on Cloudflare Workers
* Deploy on AWS Lambda
* Deploy on Google Cloud Functions
* Deploy on Azure Cloud Functions
<br>

## Roadmap

1. Support for more providers. Missing a provider or LLM Platform, [raise a feature request](https://github.com/Portkey-AI/Rubeus/issues).
2. Enhanced load balancing features to optimize resource use across different models and providers.
3. More robust fallback and retry strategies to further improve the reliability of requests.
4. Increased customizability of the unified API signature to cater to more diverse use cases.

[💬 Participate in Roadmap discussions here.](https://github.com/Portkey-AI/Rubeus/projects/)

<br>

## Contributing

The easiest way to contribute is to pick any issue with the `good first issue` tag 💪. Read the Contributing guidelines [here](/CONTRIBUTING.md).

Bug Report? [File here](https://github.com/Portkey-AI/Rubeus/issues) | Feature Request? [File here](https://github.com/Portkey-AI/Rubeus/issues)

<br>

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- View our official [Blog](https://portkey.ai/blog)
- Chat live with us on [Discord](https://discord.gg/NXepgUYp) <!-- Ideally it should be this https://portkey.ai/discord-->
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
- Visit us on [YouTube]()
- Join our [Dev community](https://dev.to/portkeyai)
- Questions tagged #surrealdb on [Stack Overflow](https://stackoverflow.com/questions/tagged/rubeus) <!-- stackoverflow tags? -->
