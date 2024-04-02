<div align="center">

# Gateway
### Route to 100+ LLMs with 1 fast & friendly API.


[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://twitter.com/portkeyai)
[![npm version](https://badge.fury.io/js/%40portkey-ai%2Fgateway.svg)](https://www.npmjs.com/package/@portkey-ai/gateway)
<a href="https://replit.com/@portkey/AI-Gateway?v=1"><img src="https://replit.com/badge?caption=Deploy%20on%20Replit" width=99 style="display:block;"/></a>



[Portkey's AI Gateway](https://portkey.ai/features/ai-gateway) is the interface between your app and hosted LLMs. It streamlines API requests to OpenAI, Anthropic, Mistral, LLama2, Anyscale, Google Gemini and more with a unified API.

<!-- Demo GIF or Image -->
<p align="center">
  <img src="docs/images/gateway_demo.gif" width="800px" alt="Gateway Demo">
</p>


</div>


Salient Features of Portkey's AI Gateway: 

✅&nbsp; Blazing **fast** (9.9x faster) with a **tiny footprint** (~45kb installed) <br>
✅&nbsp; **Load balance** across multiple models, providers, and keys <br>
✅&nbsp; **Fallbacks** make sure your app stays resilient  <br>
✅&nbsp; **Automatic Retries** with exponential fallbacks come by default  <br>
✅&nbsp; **Configurable Request Timeouts** to easily handle unresponsive LLM requests<br>
✅&nbsp; Plug-in middleware as needed <br>
✅&nbsp; Battle tested over **100B tokens** <br>
✅&nbsp; **Enterprise-ready** for enhanced security, scale, and custom deployments <br>

<br>


## How can you run Gateway?

Gateway offers three options for running: 
1. [Local Deployment](###Run-it-Locally) for complete control and customization
2. [Hosted Version](###Run-the-Hosted-API) for quick setup without infrastructure concerns
3. [Enterprise Version](#gateway-enterprise-version) with advanced features and dedicated support for large-scale deployments.

### Compatibility with OpenAI API

Gateway is fully compatible with the OpenAI API, making it seamless to integrate with your existing applications. To start routing your requests through Gateway to multiple LLMs, you only need to update your OpenAI base URL.

- For the hosted version, set your base URL to: `https://api.portkey.ai`
- For local deployment, use: `http://localhost:8787`

<br>

##  Getting Started

### Run it Locally 

If you're familiar with Node.js and `npx`, you can run your private AI gateway locally.
```bash
npx @portkey-ai/gateway
```
> Your AI Gateway is now running on http://localhost:8787 🚀

Gateway is edge-deployment ready. Explore Cloudflare, Docker, AWS etc deployment guides [here](#deploying-ai-gateway)

### Usage
Let's try making a **chat completions** call to OpenAI through the AI gateway:
```bash
curl '127.0.0.1:8787/v1/chat/completions' \
  -H 'x-portkey-provider: openai' \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"messages": [{"role": "user","content": "Say this is test."}], "max_tokens": 20, "model": "gpt-4"}'
```

### Run the Hosted API

Our hosted Gateway is the go-to solution for many prominent organizations in production.  Having processed in excess of 300 billion tokens, our Gateway has proven its reliability and scalability. 

### Python

```bash
pip install portkey-ai
```

#### Detailed guide to run 100+ LLMs in your Colab!

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/1hLvoq_VdGlJ_92sPPiwTznSra5Py0FuW?usp=sharing)



Run any LLM using OpenAI Client

```python
from openai import OpenAI
from portkey_ai import PORTKEY_GATEWAY_URL, createHeaders

client = OpenAI(
    api_key="sk-xx",  # replace it with your API key
    base_url=PORTKEY_GATEWAY_URL,
    default_headers=createHeaders(
        provider="openai",
        api_key="portkey-api" # replace it with your API key
    )
)

chat_complete = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "What's a fractal?"}],
)
```

<details><summary>You can also run any LLM using Portkey Client</summary>

```python

from portkey_ai import Portkey

portkey = Portkey(
    api_key = PORTKEY_API_KEY,  # defaults to os.environ["PORTKEY_API_KEY"]
    virtual_key= OPENAI_VIRTUAL_KEY,   # use virtual key of any provider of your choice
)

completion = portkey.chat.completions.create(
    messages= [{ "role": 'user', "content": 'Who are you?'}],
    model= 'gpt-3.5-turbo-0125', 
    max_tokens=250
)

print(completion)

```
Note: Portkey allows you to manage all your API keys centrally using virtual keys. [setup guide](https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/virtual-keys#using-virtual-keys) 

</details>



### Node.js
```bash
npm install portkey-ai
```

Run any LLM using Portkey Node.js 

```js
import Portkey from 'portkey-ai'
 
const portkey = new Portkey({
    apiKey: PORTKEY_API_KEY, // defaults to process.env["PORTKEY_API_KEY"]
    virtualKey: OPENAI_VIRTUAL_KEY // use virtual key of any provider of your choice
})


const chatCompletion = await portkey.chat.completions.create({
    messages: [{ role: 'user', content: 'Who are you?' }],
    model: 'gpt-3.5-turbo',
});

console.log(chatCompletion)
```


## Supported Providers

|| Provider  | Support | Stream | Supported Endpoints |
|---|---|---|---|--|
| <img src="docs/images/openai.png" width=35 />| OpenAI | ✅  |✅  | `/completions`, `/chat/completions`,`/embeddings`, `/assistants`, `/threads`, `/runs`, `/images/generations`, `/audio/*`|
| <img src="docs/images/azure.png" width=35>| Azure OpenAI | ✅  |✅  | `/completions`, `/chat/completions`,`/embeddings` |
| <img src="docs/images/anyscale.png" width=35>| Anyscale | ✅   | ✅  | `/chat/completions` |
| <img src="https://upload.wikimedia.org/wikipedia/commons/2/2d/Google-favicon-2015.png" width=35>| Google Gemini & Palm | ✅  |✅  | `/generateMessage`, `/generateText`, `/embedText` |
| <img src="docs/images/anthropic.png" width=35>| Anthropic  | ✅  |✅  | `/messages`, `/complete` |
| <img src="docs/images/cohere.png" width=35>| Cohere  | ✅  |✅  | `/generate`, `/embed`, `/rerank` |
| <img src="https://assets-global.website-files.com/64f6f2c0e3f4c5a91c1e823a/654693d569494912cfc0c0d4_favicon.svg" width=35>| Together AI  | ✅  |✅  | `/chat/completions`, `/completions`, `/inference` |
| <img src="https://www.perplexity.ai/favicon.svg" width=35>| Perplexity  | ✅  |✅  | `/chat/completions` |
| <img src="https://docs.mistral.ai/img/favicon.ico" width=35>| Mistral  | ✅  |✅  | `/chat/completions`, `/embeddings` |
| <img src="https://docs.nomic.ai/img/nomic-logo.png" width=35>| Nomic  | ✅  |✅  | `/embeddings` |
| <img src="https://files.readme.io/d38a23e-small-studio-favicon.png" width=35>| AI21  | ✅  |✅  | `/complete`, `/chat`, `/embed` |
| <img src="https://platform.stability.ai/small-logo-purple.svg" width=35>| Stability AI  | ✅  |✅  | `/generation/{engine_id}/text-to-image` |
| <img src="https://deepinfra.com/_next/static/media/logo.4a03fd3d.svg" width=35>| DeepInfra  | ✅  |✅  | `/inference` |
| <img src="https://ollama.com/public/ollama.png" width=35>| Ollama  | ✅  |✅  | `/chat/completions` |

> [View the complete list of 100+ supported models here](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br>


##  Expand your Gateway!

### Fallbacks 
This feature allows you to specify a prioritized list of LLMs. If the primary LLM fails, Portkey will automatically fallback to the next LLM in the list to ensure reliability.

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



### Load Balancing
Distribute load effectively across multiple API keys or providers based on custom weights to ensure high availability and optimal performance.
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


### Automatic Retries
AI Gateway can automatically retry failed requests up to 5 times. A backoff strategy spaces out retry attempts to prevent network overload.

<details>
<summary>This config would enable to retry with 5 attempts</summary>

```js
{
    "retry": {
        "attempts": 5
    },
    "virtual_key": "virtual-key-xxx"
}
```
</details>

### Request Timeouts
Manage unruly LLMs & latencies by setting up granular request timeouts, allowing automatic termination of requests that exceed a specified duration.

<details>
<summary>Here, the request timeout of 10 seconds will be applied to *all* the targets.</summary>

```js
{
  "strategy": { "mode": "fallback" },
  "request_timeout": 10000,
  "targets": [
    { "virtual_key": "open-ai-xxx" },
    { "virtual_key": "azure-open-ai-xxx" }
  ]
}
```
</details>


Here's a guide to [use config object in your request](https://portkey.ai/docs/api-reference/config-object).
<br>

## Supported SDKs

| Language | Supported SDKs |
|---|---|
| Node.js / JS / TS | [Portkey SDK](https://www.npmjs.com/package/portkey-ai) <br> [OpenAI SDK](https://www.npmjs.com/package/openai) <br> [LangchainJS](https://www.npmjs.com/package/langchain) <br> [LlamaIndex.TS](https://www.npmjs.com/package/llamaindex) |
| Python | [Portkey SDK](https://pypi.org/project/portkey-ai/) <br> [OpenAI SDK](https://portkey.ai/docs/welcome/integration-guides/openai) <br> [Langchain](https://portkey.ai/docs/welcome/integration-guides/langchain-python) <br> [LlamaIndex](https://portkey.ai/docs/welcome/integration-guides/llama-index-python) |
| Go | [go-openai](https://github.com/sashabaranov/go-openai) |
| Java | [openai-java](https://github.com/TheoKanning/openai-java) |
| Rust | [async-openai](https://docs.rs/async-openai/latest/async_openai/) |
| Ruby | [ruby-openai](https://github.com/alexrudall/ruby-openai) |
<br>




## Deploying AI Gateway
[See docs](docs/installation-deployments.md) on installing the AI Gateway locally or deploying it on popular locations.
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
- Chat live with us on [Discord](https://portkey.ai/community)
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
<!-- - Visit us on [YouTube](https://www.youtube.com/channel/UCZph50gLNXAh1DpmeX8sBdw) -->
<!-- - Join our [Dev community](https://dev.to/portkeyai) -->
<!-- - Questions tagged #portkey on [Stack Overflow](https://stackoverflow.com/questions/tagged/portkey) -->

![Rubeus Social Share (4)](https://github.com/Portkey-AI/gateway/assets/971978/89d6f0af-a95d-4402-b451-14764c40d03f)
