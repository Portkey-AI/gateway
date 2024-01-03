<!-- <img src="docs/images/header_new.png" width=2000> -->
<div align="center">
<img src="https://github.com/roh26it/Rubeus/assets/971978/50b9f1df-ff5b-43d4-91be-b817943a16f7" width=500>

# AI Gateway
### Route to 100+ LLMs with 1 fast & friendly API.

<!-- ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white) -->
<!-- ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) -->
[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://twitter.com/portkeyai)
![example workflow](https://github.com/github/docs/actions/workflows/main.yml/badge.svg)
[![npm version](https://badge.fury.io/js/%40portkey-ai%2Fgateway.svg)](https://www.npmjs.com/package/@portkey-ai/gateway)
<!-- ![Static Badge](https://img.shields.io/badge/dev_to-Follow?style=for-the-badge&logo=devdotto) -->

</div>
<!-- ![image](https://github.com/roh26it/Rubeus/assets/971978/50b9f1df-ff5b-43d4-91be-b817943a16f7) -->

<div align="centerc">



<!--[![npm version](https://badge.fury.io/js/rubeus.svg)](https://badge.fury.io/js/rubeus)
[![Build Status](https://travis-ci.com/yourusername/rubeus.svg?branch=master)](https://travis-ci.com/yourusername/rubeus)
[![Coverage Status](https://coveralls.io/repos/github/yourusername/rubeus/badge.svg?branch=master)](https://coveralls.io/github/yourusername/rubeus?branch=master)
 -->

</div>

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
<!--
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
-->
[Full list of supported SDKs](#sdks-supported)

<br>


## Supported Providers

|| Provider  | Support Status  | Supported Endpoints |
|---|---|---|---|
| <img src="docs/images/openai.png" width=18 />| OpenAI | ✅ Supported  | `/completions`, `/chat/completions`,`/embeddings`, `/assistants`, `/threads`, `/runs`, `streaming` |
| <img src="docs/images/azure.png" width=18>| Azure OpenAI | ✅ Supported  | `/completions`, `/chat/completions`,`/embeddings`, `streaming` |
| <img src="docs/images/anyscale.png" width=18>| Anyscale | ✅ Supported  | `/chat/completions`, `streaming` |
| <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" width=18>| Google Gemini & Palm | ✅ Supported  | `/generateMessage`, `/generateText`, `/embedText`, `streaming` |
| <img src="docs/images/anthropic.png" width=18>| Anthropic  | ✅ Supported  | `/messages`, `/complete`, `streaming` |
| <img src="docs/images/cohere.png" width=18>| Cohere  | ✅ Supported  | `/generate`, `/embed`, `/rerank`, `streaming` |
| <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" width=18>| Together AI  | ✅ Supported  | `/chat/completions`, `/completions`, `/inference`, `streaming` |
| <img src="https://www.perplexity.ai/favicon.svg" width=18>| Perplexity  | ✅ Supported  | `/chat/completions`, `streaming` |
| <img src="https://docs.mistral.ai/img/favicon.ico" width=18>| Mistral  | ✅ Supported  | `/chat/completions`, `/embeddings`, `streaming` |

> [View the complete list of 100+ supported models here](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br />

<!-- 
## Features
#### [Unified API Signature](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/universal-api)
Connect with 100+ LLM using OpenAI's API signature. The AI gateway handles the request, response and error transformations so you don't have to make any changes to your code. You can use the OpenAI SDK itself to connect to any of the supported LLMs.
<br>

<img src="docs/images/openai.png" height=25 />&nbsp;&nbsp;&nbsp;<img src="docs/images/azure.png" height=25 />&nbsp;&nbsp;&nbsp;
<img src="docs/images/anyscale.png" height=25 />&nbsp;&nbsp;&nbsp;
<img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" height=25 />&nbsp;&nbsp;&nbsp;
<img src="docs/images/anthropic.png" height=25 />&nbsp;&nbsp;&nbsp;
<img src="docs/images/cohere.png" height=25 /> &nbsp;&nbsp;&nbsp;
<img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" height=25 />&nbsp;&nbsp;&nbsp;
<img src="https://www.perplexity.ai/favicon.svg" height=25 /> &nbsp;&nbsp;&nbsp;
<img src="https://docs.mistral.ai/img/favicon.ico" height=25 />&nbsp;&nbsp;&nbsp;
<img src="https://1000logos.net/wp-content/uploads/2021/10/logo-Meta.png" height=25 />&nbsp;&nbsp;&nbsp;
<br>

#### [Fallback](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks)
Don't let failures stop you. The Fallback feature allows you to specify a list of Language Model APIs (LLMs) in a prioritized order. If the primary LLM fails to respond or encounters an error, Portkey will automatically fallback to the next LLM in the list, ensuring your application's robustness and reliability.
<br>

<img src="https://framerusercontent.com/images/gmlOW8yeKP2pGuIsObM6gKLzeMI.png" height=200 />
<br>

#### [Automatic Retries](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries)
Temporary issues shouldn't mean manual re-runs. AI Gateway can automatically retry failed requests upto 5 times. We apply an exponential backoff strategy, which spaces out retry attempts to prevent network overload.
<br>

<img src="https://github.com/roh26it/Rubeus/assets/971978/8a6e653c-94b2-4ba7-95c7-93544ee476b1" height=200 />
<br>

#### [Load Balancing](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing)
Distribute load effectively across multiple API keys or providers based on custom weights. This ensures high availability and optimal performance of your generative AI apps, preventing any single LLM from becoming a performance bottleneck.
<br>

<img src="https://framerusercontent.com/images/6EWuq3FWhqrPe3kKLqVspevi4.png" height=200 />
<br>
-->

## Features

<table>
  <tr>
    <td>
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/universal-api">Unified API Signature</a></h4>
      Connect with 100+ LLM using OpenAI's API signature. The AI gateway handles the request, response and error transformations so you don't have to make any changes to your code. You can use the OpenAI SDK itself to connect to any of the supported LLMs.
      <br><br>
      <img src="docs/images/openai.png" height=40 />&nbsp;&nbsp;&nbsp;<img src="docs/images/azure.png" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="docs/images/anyscale.png" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" height=40 />&nbsp;&nbsp;&nbsp;<br><br>
      <img src="docs/images/anthropic.png" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="docs/images/cohere.png" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" height=40 />&nbsp;&nbsp;&nbsp;<br><br>
      <img src="https://www.perplexity.ai/favicon.svg" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="https://docs.mistral.ai/img/favicon.ico" height=40 />&nbsp;&nbsp;&nbsp;
      <img src="https://1000logos.net/wp-content/uploads/2021/10/logo-Meta.png" height=40 />
     <br><br>
    </td>
    <td>
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks">Fallback</a></h4>
      Don't let failures stop you. The Fallback feature allows you to specify a list of Language Model APIs (LLMs) in a prioritized order. If the primary LLM fails to respond or encounters an error, Portkey will automatically fallback to the next LLM in the list, ensuring your application's robustness and reliability.
      <br><br>
      <img src="https://framerusercontent.com/images/gmlOW8yeKP2pGuIsObM6gKLzeMI.png" height=200 />
    </td>
  </tr>
</table>
<table>
  <tr>
    <td>
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries">Automatic Retries</a></h4>
      Temporary issues shouldn't mean manual re-runs. AI Gateway can automatically retry failed requests upto 5 times. We apply an exponential backoff strategy, which spaces out retry attempts to prevent network overload.
      <br><br>
      <img src="https://github.com/roh26it/Rubeus/assets/971978/8a6e653c-94b2-4ba7-95c7-93544ee476b1" height=200 />
    </td>
    <td>
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing">Load Balancing</a></h4>
      Distribute load effectively across multiple API keys or providers based on custom weights. This ensures high availability and optimal performance of your generative AI apps, preventing any single LLM from becoming a performance bottleneck.
      <br><br>
      <img src="https://framerusercontent.com/images/6EWuq3FWhqrPe3kKLqVspevi4.png" height=200 />
    </td>
  </tr>
</table>
<br>

## Configuring the AI Gateway
The AI gateway supports [configs](https://portkey.ai/docs/api-reference/config-object) to enable versatile routing strategies like **fallbacks**, **load balancing**, **retries** and more.
<br><br>
You can use these configs while making the OpenAI call through the `x-portkey-config` header
```js
// Using the OpenAI JS SDK
const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787", // The rubeus server URL
  defaultHeaders: {
    'x-portkey-config': {.. your config here ..}, 
  }
});
```
<br>
<details><summary>Here's an example config that retries an OpenAI request 5 times before falling back to Gemini Pro</summary>

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
</details>
<details>
<summary>This config would enable load balancing equally between 2 OpenAI keys</summary>

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
</details>

> Read more about the [config object](https://portkey.ai/docs/api-reference/config-object).
<br>

## Supported SDKs

| Language | Supported SDKs |
|---|---|
| Node.js / JS / TS | [Portkey SDK](https://www.npmjs.com/package/portkey-ai) <br> [OpenAI SDK](https://www.npmjs.com/package/openai) <br> [LangchainJS](https://www.npmjs.com/package/langchain) <br> [LlamaIndex.TS](https://www.npmjs.com/package/llamaindex) |
| Python | [Portkey SDK](https://pypi.org/project/portkey-ai/) <br> [OpenAI SDK](https://pypi.org/project/openai/) <br> [Langchain](https://pypi.org/project/langchain/) <br> [LlamaIndex](https://pypi.org/project/llama-index/) |
| Go | [go-openai](https://github.com/sashabaranov/go-openai) |
| Java | [openai-java](https://github.com/TheoKanning/openai-java) |
| Rust | [async-openai](https://docs.rs/async-openai/latest/async_openai/) |
| Ruby | [ruby-openai](https://github.com/alexrudall/ruby-openai) |

<br>

<!-- move to the top
## Performance
The AI Gateway was built internally at [Portkey](https://portkey.ai) and has been live in production since September 2023. It is actively maintained by Portkey with participation from open source contributors.
- It has been battle **tested over 100B tokens** processed till December '23
- It processes over **10M requests every day** and has been load tested for 1M rps
- It is built on top of the very fast [Hono](https://hono.dev) router which is **9.9x faster** than the standard express router.
<br>
-->
## Deploying Rubeus
[See docs](docs/installation-deployments.md) on installing Rubeus locally or deploying it on popular locations.

<br>

## Roadmap

1. Support for more providers. Missing a provider or LLM Platform, [raise a feature request](https://github.com/Portkey-AI/gateway/issues).
2. Enhanced load balancing features to optimize resource use across different models and providers.
3. More robust fallback and retry strategies to further improve the reliability of requests.
4. Increased customizability of the unified API signature to cater to more diverse use cases.

[💬 Participate in Roadmap discussions here.](https://github.com/Portkey-AI/gateway/projects/)

<br>

## Contributing

The easiest way to contribute is to pick any issue with the `good first issue` tag 💪. Read the Contributing guidelines [here](/CONTRIBUTING.md).

Bug Report? [File here](https://github.com/Portkey-AI/gateway/issues) | Feature Request? [File here](https://github.com/Portkey-AI/gateway/issues)

<br>

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- View our official [Blog](https://portkey.ai/blog)
- Chat live with us on [Discord](https://portkey.ai/community) <!-- Ideally it should be this https://portkey.ai/discord-->
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
- Visit us on [YouTube](https://www.youtube.com/channel/UCZph50gLNXAh1DpmeX8sBdw)
- Join our [Dev community](https://dev.to/portkeyai)
- Questions tagged #portkey on [Stack Overflow](https://stackoverflow.com/questions/tagged/portkey) <!-- stackoverflow tags? -->
