
<p align="right">
   <strong>English</strong> | <a href="./.github/README.cn.md">中文</a> | <a href="./.github/README.jp.md">日本語</a>
</p>

<div align="center">

# AI Gateway
#### Route to 250+ LLMs with 1 fast & friendly API

<img src="https://cfassets.portkey.ai/sdk.gif" width="550px" alt="Portkey AI Gateway Demo showing LLM routing capabilities" style="margin-left:-35px">

[Docs](https://portkey.ai/docs) | [Enterprise](https://portkey.ai/docs/product/enterprise-offering) | [Hosted Gateway](https://app.portkey.ai/) | [Changelog](https://new.portkey.ai) | [API Reference](https://portkey.ai/docs/api-reference/inference-api/introduction)


[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://x.com/portkeyai)
[![npm version](https://badge.fury.io/js/%40portkey-ai%2Fgateway.svg)](https://www.npmjs.com/package/@portkey-ai/gateway)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/q94g.svg)](https://status.portkey.ai/?utm_source=status_badge)
</div>

<br/>

The [**AI Gateway**](https://portkey.ai/features/ai-gateway) is designed for fast, reliable & secure routing to 1600+ language, vision, audio, and image models. It is a lightweight, open-source, and enterprise-ready solution that allows you to integrate with any language model in under 2 minutes.

- [x] **Blazing fast** (<1ms latency) with a tiny footprint (122kb)
- [x] **Battle tested**, with over 10B tokens processed everyday
- [x] **Enterprise-ready** with enhanced security, scale, and custom deployments

<br>

#### What can you do with the AI Gateway?
- Integrate with any LLM in under 2 minutes - [Quickstart](#quickstart-2-mins)
- Prevent downtimes through **[automatic retries](https://portkey.ai/docs/product/ai-gateway/automatic-retries)** and **[fallbacks](https://portkey.ai/docs/product/ai-gateway/fallbacks)**
- Scale AI apps with **[load balancing](https://portkey.ai/docs/product/ai-gateway/load-balancing)** and **[conditional routing](https://portkey.ai/docs/product/ai-gateway/conditional-routing)**
- Protect your AI deployments with **[guardrails](https://portkey.ai/docs/product/guardrails)**
- Go beyond text with **[multi-modal capabilities](https://portkey.ai/docs/product/ai-gateway/multimodal-capabilities)**
- Finally, explore **[agentic workflow](https://portkey.ai/docs/integrations/agents)** integrations

<br><br>

> [!TIP]
> Starring this repo helps more developers discover the AI Gateway 🙏🏻
> 
> ![star-2](https://github.com/user-attachments/assets/53597dce-6333-4ecc-a154-eb05532954e4)

<br>

## Quickstart (2 mins)

### 1. Setup your AI Gateway

```bash
# Run the gateway locally (needs Node.js and npm)
npx @portkey-ai/gateway
```

<sup>
Deployment guides:
&nbsp; <a href="https://app.portkey.ai"><img height="12" width="12" src="https://cfassets.portkey.ai/logo/dew-color.svg" /> Portkey Cloud (Recommended)</a>
&nbsp; <a href="./docs/installation-deployments.md#docker"><img height="12" width="12" src="https://cdn.simpleicons.org/docker/3776AB" /> Docker</a>
&nbsp; <a href="./docs/installation-deployments.md#nodejs-server"><img height="12" width="12" src="https://cdn.simpleicons.org/node.js/3776AB" /> Node.js</a>
&nbsp; <a href="./docs/installation-deployments.md#cloudflare-workers"><img height="12" width="12" src="https://cdn.simpleicons.org/cloudflare/3776AB" /> Cloudflare</a>
&nbsp; <a href="./docs/installation-deployments.md#replit"><img height="12" width="12" src="https://cdn.simpleicons.org/replit/3776AB" /> Replit</a>
&nbsp; <a href="./docs/installation-deployments.md"> Others...</a>

</sup>

### 2. Make your first request

<!-- <details open>
<summary>Python Example</summary> -->
```python
# pip install -qU portkey-ai

from portkey_ai import Portkey

# OpenAI compatible client
client = Portkey(
    provider="openai", # or 'anthropic', 'bedrock', 'groq', etc
    Authorization="sk-***" # the provider API key
)

# Make a request through your AI Gateway
client.chat.completions.create(
    messages=[{"role": "user", "content": "What's the weather like?"}],
    model="gpt-4o-mini"
)
```



<sup>Supported Libraries: 
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/javascript/3776AB" /> JS](https://www.npmjs.com/package/portkey-ai) 
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/python/3776AB" /> Python](https://github.com/Portkey-AI/portkey-python-sdk)
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/gnubash/3776AB" /> REST](https://portkey.ai/docs/api-reference/inference-api/introduction)
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/openai/3776AB" /> OpenAI SDKs](https://portkey.ai/docs/guides/getting-started/getting-started-with-ai-gateway#openai-chat-completion)
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/langchain/3776AB" /> Langchain](https://portkey.ai/docs/integrations/libraries/langchain-python)
&nbsp; [LlamaIndex](https://portkey.ai/docs/integrations/libraries/llama-index-python)
&nbsp; [Autogen](https://portkey.ai/docs/integrations/agents/autogen)
&nbsp; [CrewAI](https://portkey.ai/docs/integrations/agents/crewai)
&nbsp; [More..](https://portkey.ai/docs/integrations/libraries)
</sup>

### 3. Routing & Guardrails
`Configs` in the LLM gateway allow you to create routing rules, add reliability and setup guardrails.
```python
config = {
  "retry": {"attempts": 5},

  "output_guardrails": [{
    "default.contains": {"operator": "none", "words": ["Apple"]},
    "deny": True
  }]
}

# Attach the config to the client
client = client.with_options(config=config)

client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Reply randomly with Apple or Bat"}]
)

# This would always response with "Bat" as the guardrail denies all replies containing "Apple". The retry config would retry 5 times before giving up.
```
<div align="center">
<img src="https://portkey.ai/blog/content/images/size/w1600/2024/11/image-15.png" width=600 title="Request flow through Portkey's AI gateway with retries and guardrails" alt="Request flow through Portkey's AI gateway with retries and guardrails"/>
</div>

You can do a lot more stuff with configs in your AI gateway. [Jump to examples  →](https://portkey.ai/docs/product/ai-gateway/configs)

<br/>

### Enterprise Version (Private deployments)

<sup>

[<img height="12" width="12" src="https://cfassets.portkey.ai/amazon-logo.svg" /> AWS](https://portkey.ai/docs/product/enterprise-offering/private-cloud-deployments/aws) 
&nbsp; [<img height="12" width="12" src="https://cfassets.portkey.ai/azure-logo.svg" /> Azure](https://portkey.ai/docs/product/enterprise-offering/private-cloud-deployments/azure) 
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/googlecloud/3776AB" /> GCP](https://portkey.ai/docs/product/enterprise-offering/private-cloud-deployments/gcp) 
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/redhatopenshift/3776AB" /> OpenShift](https://github.com/Portkey-AI/helm-chart) 
&nbsp; [<img height="12" width="12" src="https://cdn.simpleicons.org/kubernetes/3776AB" /> Kubernetes](https://github.com/Portkey-AI/helm-chart) 

</sup>

The LLM Gateway's [enterprise version](https://portkey.ai/docs/product/enterprise-offering) offers advanced capabilities for **org management**, **governance**, **security** and [more](https://portkey.ai/docs/product/enterprise-offering) out of the box. [View Feature Comparison →](https://portkey.ai/docs/product/product-feature-comparison)

The enterprise deployment architecture for supported platforms is available here - [**Enterprise Private Cloud Deployments**](https://portkey.ai/docs/product/enterprise-offering/private-cloud-deployments)

<a href="https://portkey.sh/demo-13"><img src="https://portkey.ai/blog/content/images/2024/08/Get-API-Key--5-.png" height=50 alt="Book an enterprise AI gateway demo" /></a><br/>


<br>

<hr>

### AI Engineering Hours

Join weekly community calls every Friday (8 AM PT) to kickstart your AI Gateway implementation! [Calendar Link](https://lu.ma/portkey?tag=ai%20engineer)

Meetings of Minutes [published here](https://portkey.ai/docs/changelog/office-hour).

<hr>

## Core Features
### Reliable Routing
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks">**Fallbacks**</a>: Fallback to another provider or model on failed requests using the LLM gateway. You can specify the errors on which to trigger the fallback. Improves reliability of your application.
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries">**Automatic Retries**</a>: Automatically retry failed requests up to 5 times. An exponential backoff strategy spaces out retry attempts to prevent network overload.
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing">**Load Balancing**</a>: Distribute LLM requests across multiple API keys or AI providers with weights to ensure high availability and optimal performance.
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts">**Request Timeouts**</a>: Manage unruly LLMs & latencies by setting up granular request timeouts, allowing automatic termination of requests that exceed a specified duration.
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/multimodal-capabilities">**Multi-modal LLM Gateway**</a>: Call vision, audio (text-to-speech & speech-to-text), and image generation models from multiple providers  — all using the familiar OpenAI signature
- <a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/realtime-apis">**Realtime APIs**</a>: Call realtime APIs launched by OpenAI through the integrate websockets server.

### Security & Accuracy
- <a href="https://portkey.ai/docs/product/guardrails">**Guardrails**</a>: Verify your LLM inputs and outputs to adhere to your specified checks. Choose from the 40+ pre-built guardrails to ensure compliance with security and accuracy standards. You can <a href="https://portkey.ai/docs/product/guardrails#bring-your-own-guardrails">bring your own guardrails</a> or choose from our <a href="https://portkey.ai/docs/product/guardrails/list-of-guardrail-checks#partner-guardrails">many partners</a>. 
- [**Secure Key Management***](https://portkey.ai/docs/product/ai-gateway/virtual-keys): Use your own keys or generate virtual keys on the fly.
- [**Role-based access control***](https://portkey.ai/docs/product/enterprise-offering/access-control-management): Granular access control for your users, workspaces and API keys.
- <a href="https://portkey.ai/docs/product/enterprise-offering/security-portkey#compliance-and-data-privacy">**Compliance & Data Privacy**</a>: The AI gateway is SOC2, HIPAA, GDPR, and CCPA compliant.

### Cost Management
- [**Smart caching**](https://portkey.ai/docs/product/ai-gateway/cache-simple-and-semantic): Cache responses from LLMs to reduce costs and improve latency. Supports simple and semantic* caching.
- [**Usage analytics***](https://portkey.ai/docs/product/observability/analytics): Monitor and analyze your AI and LLM usage, including request volume, latency, costs and error rates.
- [**Provider optimization***](https://portkey.ai/docs/product/ai-gateway/conditional-routing): Automatically switch to the most cost-effective provider based on usage patterns and pricing models.

### Collaboration & Workflows
- <a href="https://portkey.ai/docs/integrations/agents">**Agents Support**</a>: Seamlessly integrate with popular agent frameworks to build complex AI applications. The gateway seamlessly integrates with [Autogen](https://docs.portkey.ai/docs/welcome/agents/autogen), [CrewAI](https://docs.portkey.ai/docs/welcome/agents/crewai), [LangChain](https://docs.portkey.ai/docs/welcome/agents/langchain-agents), [LlamaIndex](https://docs.portkey.ai/docs/welcome/agents/llama-agents), [Phidata](https://docs.portkey.ai/docs/welcome/agents/phidata), [Control Flow](https://docs.portkey.ai/docs/welcome/agents/control-flow), and even [Custom Agents](https://docs.portkey.ai/docs/welcome/agents/bring-your-own-agents).
- [**Prompt Template Management***](https://portkey.ai/docs/product/prompt-library): Create, manage and version your prompt templates collaboratively through a universal prompt playground.
<br/><br/>

<sup>
*&nbsp;Available in hosted and enterprise versions
</sup>

<br>

## Cookbooks

### ☄️ Trending
- Use models from [Nvidia NIM](/cookbook/providers/nvidia.ipynb) with AI Gateway
- Monitor [CrewAI Agents](/cookbook/monitoring-agents/CrewAI_with_Telemetry.ipynb) with Portkey!
- Comparing [Top 10 LMSYS Models](./use-cases/LMSYS%20Series/comparing-top10-LMSYS-models-with-Portkey.ipynb) with AI Gateway.

### 🚨 Latest
* [Create Synthetic Datasets using Nemotron](/cookbook/use-cases/Nemotron_GPT_Finetuning_Portkey.ipynb)
* [Use the LLM Gateway with Vercel's AI SDK](/cookbook/integrations/vercel-ai.md)
* [Monitor Llama Agents with Portkey's LLM Gateway](/cookbook/monitoring-agents/Llama_Agents_with_Telemetry.ipynb)

[View all cookbooks →](https://github.com/Portkey-AI/gateway/tree/main/cookbook)
<br/><br/>

## Supported Providers

Explore Gateway integrations with [45+ providers](https://portkey.ai/docs/integrations/llms) and [8+ agent frameworks](https://portkey.ai/docs/integrations/agents).

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
| <img src="https://novita.ai/favicon.ico" width=35>                                                                         | [Novita AI](https://portkey.ai/docs/integrations/llms/novita-ai)                              | ✅       | ✅      | `/chat/completions`, `/completions` |


> [View the complete list of 200+ supported models here](https://portkey.ai/docs/welcome/what-is-portkey#ai-providers-supported)
<br>

<br>

## Agents
Gateway seamlessly integrates with popular agent frameworks. [Read the documentation here](https://docs.portkey.ai/docs/welcome/agents).  


| Framework | Call 200+ LLMs | Advanced Routing | Caching | Logging & Tracing* | Observability* | Prompt Management* |
|------------------------------|--------|-------------|---------|------|---------------|-------------------|
| [Autogen](https://docs.portkey.ai/docs/welcome/agents/autogen)    | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [CrewAI](https://docs.portkey.ai/docs/welcome/agents/crewai)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [LangChain](https://docs.portkey.ai/docs/welcome/agents/langchain-agents)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Phidata](https://docs.portkey.ai/docs/welcome/agents/phidata)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Llama Index](https://docs.portkey.ai/docs/welcome/agents/llama-agents)             | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Control Flow](https://docs.portkey.ai/docs/welcome/agents/control-flow) | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |
| [Build Your Own Agents](https://docs.portkey.ai/docs/welcome/agents/bring-your-own-agents) | ✅     | ✅          | ✅      | ✅   | ✅            | ✅                |

<br>

*Available on the [hosted app](https://portkey.ai). For detailed documentation [click here](https://docs.portkey.ai/docs/welcome/agents). 


## Gateway Enterprise Version
Make your AI app more <ins>reliable</ins> and <ins>forward compatible</ins>, while ensuring complete <ins>data security</ins> and <ins>privacy</ins>.

✅&nbsp; Secure Key Management - for role-based access control and tracking <br>
✅&nbsp; Simple & Semantic Caching - to serve repeat queries faster & save costs <br>
✅&nbsp; Access Control & Inbound Rules - to control which IPs and Geos can connect to your deployments <br>
✅&nbsp; PII Redaction - to automatically remove sensitive data from your requests to prevent indavertent exposure <br>
✅&nbsp; SOC2, ISO, HIPAA, GDPR Compliances - for best security practices <br>
✅&nbsp; Professional Support - along with feature prioritization <br>

[Schedule a call to discuss enterprise deployments](https://portkey.sh/demo-13)

<br>


## Contributing

The easiest way to contribute is to pick an issue with the `good first issue` tag 💪. Read the contribution guidelines [here](/.github/CONTRIBUTING.md).

Bug Report? [File here](https://github.com/Portkey-AI/gateway/issues) | Feature Request? [File here](https://github.com/Portkey-AI/gateway/issues)


### Getting Started with the Community
Join our weekly AI Engineering Hours every Friday (8 AM PT) to:
- Meet other contributors and community members
- Learn advanced Gateway features and implementation patterns
- Share your experiences and get help
- Stay updated with the latest development priorities

[Join the next session →](https://lu.ma/portkey?tag=ai%20engineer) | [Meeting notes](https://portkey.ai/docs/changelog/office-hour)

<br>

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- View our official [Blog](https://portkey.ai/blog)
- Chat with us on [Discord](https://portkey.ai/community)
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
- Read the documentation in [Japanese](./.github/README.jp.md)
<!-- - Visit us on [YouTube](https://www.youtube.com/channel/UCZph50gLNXAh1DpmeX8sBdw) -->
<!-- - Join our [Dev community](https://dev.to/portkeyai) -->
<!-- - Questions tagged #portkey on [Stack Overflow](https://stackoverflow.com/questions/tagged/portkey) -->

![Rubeus Social Share (4)](https://github.com/Portkey-AI/gateway/assets/971978/89d6f0af-a95d-4402-b451-14764c40d03f)
