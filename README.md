<img src="docs/images/header_new.png" width=2000>

<div align="center">

![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
[![Licence](https://img.shields.io/github/license/Ileriayo/markdown-badges?style=for-the-badge)](./LICENSE)
![Discord](https://img.shields.io/discord/1143393887742861333?style=for-the-badge)
<!--[![npm version](https://badge.fury.io/js/rubeus.svg)](https://badge.fury.io/js/rubeus)
[![Build Status](https://travis-ci.com/yourusername/rubeus.svg?branch=master)](https://travis-ci.com/yourusername/rubeus)
[![Coverage Status](https://coveralls.io/repos/github/yourusername/rubeus/badge.svg?branch=master)](https://coveralls.io/github/yourusername/rubeus?branch=master)
 -->
<!-- Need Social channels like Twitter, Linkedin, Dev.to, Hashnode -->


</div>

## What is Rubeus? 

Rubeus is the interface between you and the LLM applications. It streamlines API requests to 20+ LLMs and provides a unified API signature for interacting with all LLMs acting as a **AI Gateway**. 

Rubeus comes with powerful features like load balancing, fallbacks, retries, security, and more. 

Take it for a spin  🚀

<!-- Docker Container command -->

### Docker

```bash
docker pull portkey-ai/rubeus
```

### Mac

```bash
brew install rubeus
```

### Windows

```bash
choco install rubeus
```

## Why Rubeus?

Rubeus offers a unified, resilient, and efficient gateway for interacting with multiple LLMs, making it an ideal choice for developers and businesses looking to leverage AI in their applications.

<!-- Illustration or Image with Rubeus -->

## Features

* 🌐 **Interoperability:** Write once, run with any provider. Switch between __ models from __ providers seamlessly.
* 🔀 **Fallback Strategies:** Don't let failures stop you. If one provider fails, Rubeus can automatically switch to another.
* 🔄 **Retry Strategies:** Temporary issues shouldn't mean manual re-runs. Rubeus can automatically retry failed requests.
* ⚖️ **Load Balancing:** Distribute load effectively across multiple API keys or providers based on custom weights.
* 📝 **Unified API Signature:** If you've used OpenAI, you already know how to use Rubeus with any other provider.
<br><br>

## Contents

- [Getting Started](#getting-started)
- [Supported Providers](#supported-providers)
- [Usage](#usage)
  - [Interoperability](#🌐-interoperability)
  - [Fallback Strategies](#🔀-fallback-strategies)
  - [Retry Strategies](#🔄-retry-strategies)
  - [Load Balancing](#⚖️-load-balancing)
  - [Unified API Signature](#📝-unified-api-signature)
- [Deploying Rubeus](#installation)
- [Built with Rubeus](#built-with-rubeus)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

```bash
npm install
npm run dev # To run locally
npm run deploy # To deploy to cloudflare
```

## Supported Providers

|| Provider  | Support Status  | Supported Endpoints |
|---|---|---|---|
| <img src="docs/images/openai.png" width=18 />| OpenAI | ✅ Supported  | `/completion`, `/chat/completions`,`/embed` |
| <img src="docs/images/azure.png" width=18>| Azure OpenAI | ✅ Supported  | `/completion`, `/chat/completions`,`/embed` |
| <img src="docs/images/anyscale.png" width=18>| Anyscale | ✅ Supported  | `/chat/completions` |
| <img src="docs/images/anthropic.png" width=18>| Anthropic  | ✅ Supported  | `/complete` |
| <img src="docs/images/cohere.png" width=18>| Cohere  | ✅ Supported  | `generate`, `embed` |
| <img src="docs/images/palm.png" width=18>| Google Palm | ✅ Supported  | `/generateMessage`, `/generateText`, `/embedText` |
| <img src="docs/images/bard.png" width=18>| Google Bard  | 🚧 Coming Soon  |  |
| <img src="docs/images/localai.png" width=18>| LocalAI  | 🚧 Coming Soon  |  |

<br />

## Usage

### 🌐 Interoperability
Rubeus allows you to switch between different language learning models from various providers, making it a highly flexible tool. The following example shows a request to `openai`, but you could change the provider name to `cohere`, `anthropic` or others and Rubeus will automatically handle everything else.

### Simple request
Either pass x-rubeus-config header with provider and key details or send x-rubeus-provider and authorization header
```bash
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-config: {"provider":"openai","api_key":"open_ai_key"}' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "model": "text-davinci-003",
    "user": "jbu3470"
}'
```
OR
```bash
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-provider: openai' \
--header 'Authorization: $OPENAI_KEY' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "model": "text-davinci-003",
    "user": "jbu3470"
}'
```

### 🔀 Fallback Strategies
In case one provider fails, Rubeus is designed to automatically switch to another, ensuring uninterrupted service.

```bash
# Fallback to anthropic, if openai fails (This API will use the default text-davinci-003 and claude-v1 models)
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-config: {"strategy":{"mode":"fallback"},"targets":[{"provider":"openai","api_key":"sk-***", "override_params": {"model": "gpt-3.5-turbo"}},{"provider":"anthropic","api_key":"sk-***", "override_params": {"model": "claude-v2"}}]}' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "user": "jbu3470"
}'

# Fallback to gpt-3.5-turbo when gpt-4 fails
curl --location 'http://127.0.0.1:8787/v1/chat/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-config: {"strategy":{"mode":"fallback"},"targets":[{"provider":"openai","api_key":"sk-***","override_params":{"model":"gpt-4"}},{"provider":"anthropic","api_key":"sk-***","override_params":{"model":"gpt-3.5-turbo"}}]}' \
--data-raw '{
    "messages": [{"role": "user", "content": "What are the top 10 happiest countries in the world?"}],
    "max_tokens": 50,
    "user": "jbu3470"
}'
```

### 🔄 Retry Strategies
Rubeus has a built-in mechanism to retry failed requests, eliminating the need for manual re-runs.
```bash
# Add the retry configuration to enable exponential back-off retries
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-config: {"provider":"openai","api_key":"sk-***", "retry": {"attempts": 3, "on_status_codes": [429, 500, 502]}}' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "model": "text-davinci-003",
    "user": "jbu3470"
}'
```

### ⚖️ Load Balancing
Manage your workload effectively with Rubeus's custom weight-based distribution across multiple API keys or providers.
```bash
# Load balance 50-50 between gpt-3.5-turbo and claude-v2
curl --location 'http://127.0.0.1:8787/v1/chat/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-config: {"strategy":{"mode":"loadbalance"},"targets":[{"provider":"openai","api_key":"sk-***", "weight": 0.5, "override_params":{"model":"gpt-3.5-turbo"}},{"provider":"anthropic","api_key":"sk-***", "weight": 0.5, "override_params":{"model":"claude-v2"}}]}' \
--data '{
    "messages": [
        {
            "role": "user",
            "content":"What are the top 10 happiest countries in the world?"
        }
    ],
    "max_tokens": 50,
    "user": "jbu3470"
}'
```

### 📝 Unified API Signature
If you're familiar with OpenAI's API, you'll find Rubeus's API easy to use due to its unified signature.
```bash
# OpenAI query
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-provider: openai' \
--header 'Authorization: $OPEN_AI_KEY' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "user": "jbu3470"
}'

# Anthropic Query
curl --location 'http://127.0.0.1:8787/v1/completions' \
--header 'Content-Type: application/json' \
--header 'x-rubeus-provider: anthropic' \
--header 'Authorization: $ANTHROPIC_KEY' \
--data-raw '{
    "prompt": "What are the top 10 happiest countries in the world?",
    "max_tokens": 50,
    "user": "jbu3470"
}'
```

<!--## Built with Rubeus

| Name | Description |
| -- | -- |
| Portkey.ai | Full Stack LLMOps |-->


## Deploying Rubeus

* Deploy on Kubernetes
* Deploy on Vercel
* Deploy on Cloudflare Workers
* Deploy on AWS Lambda
* Deploy on Google Cloud Functions
* Deploy on Azure Cloud Functions

## SDKs

**NodeJS**

```bash
npm install --save portkey-ai
```

**Python**

```bash
pip install portkey-ai
```

> **Note:** Rubeus is compatible with OpenAI's SDKs for [.NET](https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/openai/Azure.AI.OpenAI), [Java](https://github.com/Azure/azure-sdk-for-java/tree/main/sdk/openai/azure-ai-openai), [Go](https://github.com/Azure/azure-sdk-for-go/tree/main/sdk/ai/azopenai)

## Roadmap

1. Support for more providers. Missing a provider or LLM Platform, [raise a feature request](https://github.com/Portkey-AI/Rubeus/issues).
2. Enhanced load balancing features to optimize resource use across different models and providers.
3. More robust fallback and retry strategies to further improve the reliability of requests.
4. Increased customizability of the unified API signature to cater to more diverse use cases.

[💬 Participate in Roadmap discussions here.](https://github.com/Portkey-AI/Rubeus/projects/)

## Contributing

The easiest way to contribute is to pick any issue with the `good first issue` tag 💪. Read the Contributing guidelines [here](/CONTRIBUTING.md).

Bug Report? [File here](https://github.com/Portkey-AI/Rubeus/issues) | Feature Request? [File here](https://github.com/Portkey-AI/Rubeus/issues)

## Community

Join our growing community around the world, for help, ideas, and discussions on AI.

- View our official [Blog](https://portkey.ai/blog)
- Chat live with us on [Discord](https://discord.gg/NXepgUYp) <!-- Ideally it should be this https://portkey.ai/discord-->
- Follow us on [Twitter](https://twitter.com/PortkeyAI)
- Connect with us on [LinkedIn](https://www.linkedin.com/company/portkey-ai/)
- Visit us on [YouTube]()
- Join our [Dev community](https://dev.to/portkeyai)
- Questions tagged #surrealdb on [Stack Overflow](https://stackoverflow.com/questions/tagged/rubeus) <!-- stackoverflow tags? -->

## License

Rubeus is licensed under the MIT License. See the [LICENSE file](https://github.com/Portkey-AI/Rubeus/blob/worker/LICENSE) for more details.
