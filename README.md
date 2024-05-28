<div align="center">

<p align="right">
   <strong>English</strong> | <a href="./README.cn.md">中文</a> 
</p>


# AI Gateway
#### Reliably route to 100+ LLMs with 1 fast & friendly API
<img src="docs/images/demo.gif" width="650" alt="Gateway Demo"><br>

[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://twitter.com/portkeyai)
[![npm version](https://badge.fury.io/js/%40portkey-ai%2Fgateway.svg)](https://www.npmjs.com/package/@portkey-ai/gateway)
<a href="https://replit.com/@portkey/AI-Gateway?v=1"><img src="https://replit.com/badge?caption=Deploy%20on%20Replit" width=99 style="display:block;"/></a>

</div>

Gateway streamlines requests to 100+ open & closed source models with a unified API. It is also production-ready with support for caching, fallbacks, retries, timeouts, loadbalancing, and can be edge-deployed for minimum latency.

✅&nbsp; **Blazing fast** (9.9x faster) with a **tiny footprint** (~45kb installed) <br>
✅&nbsp; **Load balance** across multiple models, providers, and keys <br>
✅&nbsp; **Fallbacks** make sure your app stays resilient <br>
✅&nbsp; **Automatic Retries** with exponential fallbacks come by default <br>
✅&nbsp; **Configurable Request Timeouts** to easily handle unresponsive LLM requests <br>
✅&nbsp; **Multimodal** to support routing between Vision, TTS, STT, Image Gen, and more models <br>
✅&nbsp; **Plug-in** middleware as needed <br>
✅&nbsp; Battle tested over **300B tokens** <br>
✅&nbsp; **Enterprise-ready** for enhanced security, scale, and custom deployments <br>
<br>
## How to Run the Gateway?

1. [Run it Locally](#run-it-locally) for complete control & customization
2. [Hosted by Portkey](#gateway-hosted-by-portkey) for quick setup without infrastructure concerns
3. [Enterprise On-Prem](#gateway-enterprise-version) for advanced features and dedicated support

### Run it Locally

Run the following command in your terminal and it will spin up the Gateway on your local system:
```bash
npx @portkey-ai/gateway
```
<sup>Your AI Gateway is now running on http://localhost:8787 🚀</sup>

Gateway is also edge-deployment ready. Explore Cloudflare, Docker, AWS etc. deployment [guides here](#deploying-the-ai-gateway).

### Gateway Hosted by Portkey

This same open-source Gateway powers Portkey API that processes **billions of tokens** daily and is in production with companies like Postman, Haptik, Turing, MultiOn, SiteGPT, and more.

Sign up for the free developer plan (10K request/month) [here](https://app.portkey.ai/) or [discuss here](https://calendly.com/rohit-portkey/noam) for enterprise deployments.

<br>

## How to Use the Gateway?

### Compatible with OpenAI API & SDK

Gateway is fully compatible with the OpenAI API & SDK, and extends them to call 100+ LLMs and makes them reliable. To use the Gateway through OpenAI, you only need to update your `base_URL` and pass the provider name in headers.
* To use through Portkey, set your `base_URL` to: `https://api.portkey.ai/v1`
* To run locally, set: `http://localhost:8787/v1`

Let's see how we can use the Gateway to make an Anthropic request in OpenAI spec below - the same will follow for all the other providers.

### <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/1869px-Python-logo-notext.svg.png" height=20 /> Python
```bash
pip install portkey-ai
```
<a href="https://colab.research.google.com/drive/1hLvoq_VdGlJ_92sPPiwTznSra5Py0FuW?usp=sharing"><img src="https://colab.research.google.com/assets/colab-badge.svg"></a>

While instantiating your OpenAI client,
1. Set the `base_URL` to `http://localhost:8787/v1` (or `PORTKEY_GATEWAY_URL` through the Portkey SDK if you're using the hosted version)
2. Pass the provider name in the `default_headers` param (here we are using `createHeaders` method with the Portkey SDK to auto-create the full header)

```python
from openai import OpenAI
from portkey_ai import PORTKEY_GATEWAY_URL, createHeaders

gateway = OpenAI(
    api_key="ANTHROPIC_API_KEY",
    base_url=PORTKEY_GATEWAY_URL, # Or http://localhost:8787/v1 when running locally
    default_headers=createHeaders(
        provider="anthropic",
        api_key="PORTKEY_API_KEY" # Grab from https://app.portkey.ai # Not needed when running locally
    )
)

chat_complete = gateway.chat.completions.create(
    model="claude-3-sonnet-20240229",
    messages=[{"role": "user", "content": "What's a fractal?"}],
    max_tokens=512
)
```
If you want to run the Gateway locally, don't forget to run `npx @portkey-ai/gateway` in your terminal before this! Otherwise just [sign up on Portkey](https://app.portkey.ai/) and keep your Portkey API Key handy.

### <img src="https://cdn-icons-png.flaticon.com/512/5968/5968322.png" height=20 /> Node.JS
Works the same as in Python. Add `baseURL` & `defaultHeaders` while instantiating your OpenAI client and pass the relevant provider details.

```bash
npm install portkey-ai
```

```js
import OpenAI from 'openai';
import { PORTKEY_GATEWAY_URL, createHeaders } from 'portkey-ai'
 
const gateway = new OpenAI({
   apiKey: "ANTHROPIC_API_KEY",
    baseURL: PORTKEY_GATEWAY_URL, // Or http://localhost:8787/v1 when running locally
    defaultHeaders: createHeaders({
        provider: "anthropic",
        apiKey: "PORTKEY_API_KEY" // Grab from https://app.portkey.ai / Not needed when running locally
  })
});

async function main(){
   const chatCompletion = await portkey.chat.completions.create({
      messages: [{ role: 'user', content: 'Who are you?' }],
      model: 'claude-3-sonnet-20240229',
      maxTokens:512
   });
   console.log(chatCompletion.choices[0].message.content);
}

main()
```

### <img src="https://www.svgrepo.com/show/305922/curl.svg" height=20 /> REST
In your OpenAI REST request, 
1. Change the request URL to `https://api.portkey.ai/v1` (or `http://localhost:8787/v1` if you're hosting locally)
2. Pass an additional `x-portkey-provider` header with the provider's name
3. Change the model's name to `claude-3`

```bash
curl 'http://localhost:8787/v1/chat/completions' \
  -H 'x-portkey-provider: anthropic' \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "model": "claude-3-haiku-20240229", "messages": [{"role": "user","content": "Hi"}] }'
```

For other providers, change the `provider` & `model` to their respective values.


## Gateway Docs

Head over to [Portkey docs](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations) for detailed [guides & cookbooks](https://portkey.ai/docs/welcome/integration-guides) on more [provider integrations](https://portkey.ai/docs/welcome/integration-guides).

|                                                                                                                            | Provider                                                                                      | Support | Stream |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- | ------ |
| <img src="docs/images/openai.png" width=35 />                                                                              | [OpenAI](https://portkey.ai/docs/welcome/integration-guides/openai)                           | ✅       | ✅      |
| <img src="docs/images/azure.png" width=35>                                                                                 | [Azure OpenAI](https://portkey.ai/docs/welcome/integration-guides/azure-openai)               | ✅       | ✅      |
| <img src="docs/images/anyscale.png" width=35>                                                                              | [Anyscale](https://portkey.ai/docs/welcome/integration-guides/anyscale-llama2-mistral-zephyr) | ✅       | ✅      |
| <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" width=35>                           | [Google Gemini & Palm](https://portkey.ai/docs/welcome/integration-guides/gemini)             | ✅       | ✅      |
| <img src="docs/images/anthropic.png" width=35>                                                                             | [Anthropic](https://portkey.ai/docs/welcome/integration-guides/anthropic)                     | ✅       | ✅      |
| <img src="docs/images/cohere.png" width=35>                                                                                | [Cohere](https://portkey.ai/docs/welcome/integration-guides/cohere)                           | ✅       | ✅      |
| <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" width=35> | [Together AI](https://portkey.ai/docs/welcome/integration-guides/together-ai)                 | ✅       | ✅      |
| <img src="https://www.perplexity.ai/favicon.svg" width=35>                                                                 | [Perplexity](https://portkey.ai/docs/welcome/integration-guides/perplexity-ai)                | ✅       | ✅      |
| <img src="https://docs.mistral.ai/img/favicon.ico" width=35>                                                               | [Mistral](https://portkey.ai/docs/welcome/integration-guides/mistral-ai)                      | ✅       | ✅      |
| <img src="https://docs.nomic.ai/img/nomic-logo.png" width=35>                                                              | [Nomic](https://portkey.ai/docs/welcome/integration-guides/nomic)                             | ✅       | ✅      |
| <img src="https://files.readme.io/d38a23e-small-studio-favicon.png" width=35>                                              | [AI21](https://portkey.ai/docs/welcome/integration-guides)                                    | ✅       | ✅      |
| <img src="https://platform.stability.ai/small-logo-purple.svg" width=35>                                                   | [Stability AI](https://portkey.ai/docs/welcome/integration-guides/stability-ai)               | ✅       | ✅      |
| <img src="https://deepinfra.com/_next/static/media/logo.4a03fd3d.svg" width=35>                                            | [DeepInfra](https://portkey.ai/docs/welcome/integration-guides)                               | ✅       | ✅      |
| <img src="https://ollama.com/public/ollama.png" width=35>                                                                  | [Ollama](https://portkey.ai/docs/welcome/integration-guides/ollama)                           | ✅       | ✅      |
| <img src="https://novita.ai/favicon.ico" width=35>                                                                         | Novita AI                                                                                     | ✅       | ✅      | `/chat/completions`, `/completions` |

> [View the complete list of 100+ supported models here](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br>

## Reliability Features

<table width=100%>
  <tr>
    <td width="50%">
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks">Fallbacks</a></h4>
      This feature allows you to specify a prioritized list of LLMs. If the primary LLM fails, Portkey will automatically fallback to the next LLM in the list to ensure reliability.
      <br><br>
      <img src="https://framerusercontent.com/images/gmlOW8yeKP2pGuIsObM6gKLzeMI.png" height=100 />
    </td>
    <td width="50%">
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries">Automatic Retries</a></h4>
      AI Gateway can automatically retry failed requests up to 5 times. A backoff strategy spaces out retry attempts to prevent network overload.
      <br><br>
      <img src="https://github.com/roh26it/Rubeus/assets/971978/8a6e653c-94b2-4ba7-95c7-93544ee476b1" height=100 />
    </td>
  </tr>
</table>
<table width="100%">
  <tr>
    <td width="50%"> 
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing">Load Balancing</a></h4>
      Distribute load effectively across multiple API keys or providers based on custom weights to ensure high availability and optimal performance.
      <br><br>
      <img src="https://framerusercontent.com/images/6EWuq3FWhqrPe3kKLqVspevi4.png" height=100 />
    </td>
    <td width="50%">
      <h4><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts">Request Timeouts</a></h4>
      Manage unruly LLMs & latencies by setting up granular request timeouts, allowing automatic termination of requests that exceed a specified duration.
      <br><br>
      <img src="https://github.com/vrushankportkey/gateway/assets/134934501/b23b98b2-6451-4747-8898-6847ad8baed4" height=100 />
    </td>
  </tr>
</table>

#### Reliability features are set by passing a relevant Gateway Config (JSON) with the `x-portkey-config` header or with the `config` param in the SDKs

### Example: Setting up Fallback from OpenAI to Anthropic

#### Write the fallback logic
```json
{
  "strategy": { "mode": "fallback" },
  "targets": [
    { "provider": "openai", "api_key": "OPENAI_API_KEY" },
    { "provider": "anthropic", "api_key": "ANTHROPIC_API_KEY" }
  ]
}
```
#### Use it while making your request
Portkey Gateway will automatically trigger Anthropic if the OpenAI request fails:

```REST```
```bash
curl 'http://localhost:8787/v1/chat/completions' \
  -H 'x-portkey-provider: google' \
  -H 'x-portkey-config: $CONFIG' \
  -H "Authorization: Bearer $GOOGLE_AI_STUDIO_KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "model": "gemini-1.5-pro-latest", "messages": [{"role": "user","content": "Hi"}] }'
```
You can also trigger Fallbacks only on specific status codes by passing an array of status codes with the `on_status_codes` param in `strategy`. 

[Read the full Fallback documentation here.](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks)

### Example: Loadbalance Requests across 3 Accounts
#### Write the loadbalancer config
```json
{
  "strategy": { "mode": "loadbalance" },
  "targets": [
    { "provider": "openai", "api_key": "ACCOUNT_1_KEY", "weight": 1 },
    { "provider": "openai", "api_key": "ACCOUNT_2_KEY", "weight": 1 },
    { "provider": "openai", "api_key": "ACCOUNT_3_KEY", "weight": 1 }
  ]
}
```
#### Pass the config while instantiating OpenAI client
```ts
import OpenAI from 'openai';
import { PORTKEY_GATEWAY_URL, createHeaders } from 'portkey-ai'
 
const gateway = new OpenAI({
  baseURL: PORTKEY_GATEWAY_URL,
  defaultHeaders: createHeaders({
    apiKey: "PORTKEY_API_KEY",
    config: "CONFIG_ID"
  })
});
```

[Read the Loadbalancing docs here.](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing)

### Automatic Retries

<details>
<summary>Similarly, you can write a Config that will attempt retries up to 5 times</summary>
  
```json
{
    "retry": { "attempts": 5 }
}
```
[Read the full Retries documentation here.](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries)

</details>


### Request Timeouts

<details>
<summary>Here, the request timeout of 10 seconds will be applied to *all* the targets.</summary>

```json
{
  "strategy": { "mode": "fallback" },
  "request_timeout": 10000,
  "targets": [
    { "virtual_key": "open-ai-xxx" },
    { "virtual_key": "azure-open-ai-xxx" }
  ]
}
```

[Read the full Request Timeouts documentation here.](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts)

</details>


### Using Gateway Configs

Here's a guide to [use the config object in your request](https://portkey.ai/docs/api-reference/config-object).

<br>

## Supported SDKs

| Language          | Supported SDKs                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js / JS / TS | [Portkey SDK](https://www.npmjs.com/package/portkey-ai) <br> [OpenAI SDK](https://www.npmjs.com/package/openai) <br> [LangchainJS](https://www.npmjs.com/package/langchain) <br> [LlamaIndex.TS](https://www.npmjs.com/package/llamaindex)                                                                      |
| Python            | [Portkey SDK](https://pypi.org/project/portkey-ai/) <br> [OpenAI SDK](https://portkey.ai/docs/welcome/integration-guides/openai) <br> [Langchain](https://portkey.ai/docs/welcome/integration-guides/langchain-python) <br> [LlamaIndex](https://portkey.ai/docs/welcome/integration-guides/llama-index-python) |
| Go                | [go-openai](https://github.com/sashabaranov/go-openai)                                                                                                                                                                                                                                                          |
| Java              | [openai-java](https://github.com/TheoKanning/openai-java)                                                                                                                                                                                                                                                       |
| Rust              | [async-openai](https://docs.rs/async-openai/latest/async_openai/)                                                                                                                                                                                                                                               |
| Ruby              | [ruby-openai](https://github.com/alexrudall/ruby-openai)                                                                                                                                                                                                                                                        |
<br>




## Deploying the AI Gateway
[See docs](docs/installation-deployments.md) on installing the AI Gateway locally or deploying it on popular locations.
- Deploy to [App Stack](docs/installation-deployments.md#deploy-to-app-stack)
- Deploy to [Cloudflare Workers](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-to-cloudflare-workers)
- Deploy using [Docker](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-using-docker)
- Deploy using [Docker Compose](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-using-docker-compose)
- Deploy to [Zeabur](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-to-zeabur)
- Run a [Node.js server](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#run-a-nodejs-server)
<br>

## Gateway Enterprise Version
Make your AI app more <ins>reliable</ins> and <ins>forward compatible</ins>, while ensuring complete <ins>data security</ins> and <ins>privacy</ins>.

✅&nbsp; Secure Key Management - for role-based access control and tracking <br>
✅&nbsp; Simple & Semantic Caching - to serve repeat queries faster & save costs <br>
✅&nbsp; Access Control & Inbound Rules - to control which IPs and Geos can connect to your deployments <br>
✅&nbsp; PII Redaction - to automatically remove sensitive data from your requests to prevent indavertent exposure <br>
✅&nbsp; SOC2, ISO, HIPAA, GDPR Compliances - for best security practices <br>
✅&nbsp; Professional Support - along with feature prioritization <br>

[Schedule a call to discuss enterprise deployments](https://calendly.com/rohit-portkey/noam)

<br>


## Contributing

The easiest way to contribute is to pick any issue with the `good first issue` tag 💪. Read the Contributing guidelines [here](/CONTRIBUTING.md).

Bug Report? [File here](https://github.com/Portkey-AI/gateway/issues) | Feature Request? [File here](https://github.com/Portkey-AI/gateway/issues)

<br>

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- View our official [Blog](https://portkey.ai/blog)
- Chat with us on [Discord](https://portkey.ai/community)
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
<!-- - Visit us on [YouTube](https://www.youtube.com/channel/UCZph50gLNXAh1DpmeX8sBdw) -->
<!-- - Join our [Dev community](https://dev.to/portkeyai) -->
<!-- - Questions tagged #portkey on [Stack Overflow](https://stackoverflow.com/questions/tagged/portkey) -->

![Rubeus Social Share (4)](https://github.com/Portkey-AI/gateway/assets/971978/89d6f0af-a95d-4402-b451-14764c40d03f)
