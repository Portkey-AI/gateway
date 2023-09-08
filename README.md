<img src="docs/images/header.png" width=2000>

<div align="center">

![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
[![Licence](https://img.shields.io/github/license/Ileriayo/markdown-badges?style=for-the-badge)](./LICENSE)
![Discord](https://img.shields.io/discord/1143393887742861333?style=for-the-badge)
<!--[![npm version](https://badge.fury.io/js/rubeus.svg)](https://badge.fury.io/js/rubeus)
[![Build Status](https://travis-ci.com/yourusername/rubeus.svg?branch=master)](https://travis-ci.com/yourusername/rubeus)
[![Coverage Status](https://coveralls.io/repos/github/yourusername/rubeus/badge.svg?branch=master)](https://coveralls.io/github/yourusername/rubeus?branch=master)
 -->

</div>

### **Rubeus** streamlines API requests to 20+ LLMs. It provides a unified API signature for interacting with all LLMs alongwith powerful LLM Gateway features like load balancing, fallbacks, retries and more. 

- [Features](#features)
- [Supported Providers](#supported-providers)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [Interoperability](#-interoperability)
  - [Fallback Strategies](#🔀-fallback-strategies)
  - [Retry Strategies](#🔄-retry-strategies)
  - [Load Balancing](#⚖️-load-balancing)
  - [Unified API Signature](#📝-unified-api-signature)
- [Built with Rubeus](#built-with-rubeus)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)


## Features

* 🌐 **Interoperability:** Write once, run with any provider. Switch between __ models from __ providers seamlessly.
* 🔀 **Fallback Strategies:** Don't let failures stop you. If one provider fails, Rubeus can automatically switch to another.
* 🔄 **Retry Strategies:** Temporary issues shouldn't mean manual re-runs. Rubeus can automatically retry failed requests.
* ⚖️ **Load Balancing:** Distribute load effectively across multiple API keys or providers based on custom weights.
* 📝 **Unified API Signature:** If you've used OpenAI, you already know how to use Rubeus with any other provider.
<br><br>
## Supported Providers

|| Provider  | Support Status  | Supported Endpoints |
|---|---|---|---|
| <img src="docs/images/openai.png" width=18 />| OpenAI | ✅ Supported  | `/completion`, `/embed` |
| <img src="docs/images/azure.png" width=18>| Azure OpenAI | ✅ Supported  | `/completion`, `/embed` |
| <img src="docs/images/anthropic.png" width=18>| Anthropic  | ✅ Supported  | `/complete` |
| <img src="docs/images/cohere.png" width=18>| Cohere  | ✅ Supported  | `generate`, `embed` |
| <img src="docs/images/bard.png" width=18>| Google Bard  | 🚧 Coming Soon  |  |
| <img src="docs/images/localai.png" width=18>| LocalAI  | 🚧 Coming Soon  |  |

<br />

## Getting Started

```bash
npm install
npm run dev # To run locally
npm run deploy # To deploy to cloudflare
```

## Usage

### 🌐 Interoperability
Rubeus allows you to switch between different language learning models from various providers, making it a highly flexible tool. The following example shows a request to `openai`, but you could change the provider name to `cohere`, `anthropic` or others and Rubeus will automatically handle everything else.

```bash
curl --location 'http://127.0.0.1:8787/v1/complete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "provider": "openai",
        "apiKey: "<open-ai-api-key-here>"
    },
    "params": {
        "prompt": "What are the top 10 happiest countries in the world?",
        "max_tokens": 50,
        "model": "text-davinci-003",
        "user": "jbu3470"
    }
}'
```

### 🔀 Fallback Strategies
In case one provider fails, Rubeus is designed to automatically switch to another, ensuring uninterrupted service.

```bash
# Fallback to anthropic, if openai fails (This API will use the default text-davinci-003 and claude-v1 models)
curl --location 'http://127.0.0.1:8787/v1/complete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "mode": "fallback",
        "options": [
          {
            "provider": "openai",
            "apiKey": "<open-ai-api-key-here>"
          }, 
          {
            "provider": "anthropic",
            "apiKey": "<anthropic-api-key-here>"
          }
        ]
    },
    "params": {
        "prompt": "What are the top 10 happiest countries in the world?",
        "max_tokens": 50,
        "user": "jbu3470"
    }
}'

# Fallback to gpt-3.5-turbo when gpt-4 fails
curl --location 'http://127.0.0.1:8787/v1/chatComplete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "mode": "fallback",
        "options": [
          {
            "provider": "openai", 
            "override_params": {"model": "gpt-4"},
            "apiKey": "<open-ai-api-key-here>" 
          }, 
          {
            "provider": "openai", 
            "override_params": {"model": "gpt-3.5-turbo"},
            "apiKey": "<open-ai-api-key-here>"
          }
        ]
    },
    "params": {
        "messages": [{"role": "user", "content": "What are the top 10 happiest countries in the world?"}],
        "max_tokens": 50,
        "user": "jbu3470"
    }
}'
```

### 🔄 Retry Strategies
Rubeus has a built-in mechanism to retry failed requests, eliminating the need for manual re-runs.
```bash
# Add the retry configuration to enable exponential back-off retries
curl --location 'http://127.0.0.1:8787/v1/complete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "mode": "single",
        "options": [{
            "provider": "openai",
            "retry": {
                "attempts": 3,
                "onStatusCodes": [429,500,504,524]
            },
            "apiKey": "<open-ai-api-key-here>"
        }]
    },
    "params": {
        "prompt": "What are the top 10 happiest countries in the world?",
        "max_tokens": 50,
        "model": "text-davinci-003",
        "user": "jbu3470"
    }
}'
```

### ⚖️ Load Balancing
Manage your workload effectively with Rubeus's custom weight-based distribution across multiple API keys or providers.
```bash
# Load balance 50-50 between gpt-3.5-turbo and claude-v1
curl --location 'http://127.0.0.1:8787/v1/chatComplete' \
--header 'Content-Type: application/json' \
--data '{
    "config": {
        "mode": "loadbalance",
        "options": [{
            "provider": "openai",
            "weight": 0.5,
            "override_params": { "model": "gpt-3.5-turbo" },
            "apiKey": "<open-ai-api-key-here>"
        }, {
            "provider": "anthropic",
            "weight": 0.5,
            "override_params": { "model": "claude-v1" },
            "apiKey": "<anthropic-api-key-here>"
        }]
    },
    "params": {
        "messages": [{"role": "user","content":"What are the top 10 happiest countries in the world?"}],
        "max_tokens": 50,
        "user": "jbu3470"
    }
}'
```

### 📝 Unified API Signature
If you're familiar with OpenAI's API, you'll find Rubeus's API easy to use due to its unified signature.
```bash
# OpenAI query
curl --location 'http://127.0.0.1:8787/v1/complete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "provider": "openai",
        "apiKey": "<open-ai-api-key-here>"
    },
    "params": {
        "prompt": "What are the top 10 happiest countries in the world?",
        "max_tokens": 50,
        "user": "jbu3470"
    }
}'

# Anthropic Query
curl --location 'http://127.0.0.1:8787/v1/complete' \
--header 'Content-Type: application/json' \
--data-raw '{
    "config": {
        "provider": "anthropic",
        "apiKey": "<anthropic-api-key-here>"
    },
    "params": {
        "prompt": "What are the top 10 happiest countries in the world?",
        "max_tokens": 50,
        "user": "jbu3470"
    }
}'
```

## Built with Rubeus

| Name | Description |
| -- | -- |
| Portkey.ai | Full Stack LLMOps |


## Roadmap

1. Support for more providers, including Google Bard and LocalAI.
2. Enhanced load balancing features to optimize resource use across different models and providers.
3. More robust fallback and retry strategies to further improve the reliability of requests.
4. Increased customizability of the unified API signature to cater to more diverse use cases.

[💬 Participate in Roadmap discussions here.](https://github.com/Portkey-AI/Rubeus/issues)

## Contributing

* Bug Report? [File here](https://github.com/Portkey-AI/Rubeus/issues).
* Feature Request? [File here](https://github.com/Portkey-AI/Rubeus/issues).
* Reach out to the developers directly: [Rohit](https://twitter.com/jumbld) | [Ayush](https://twitter.com/ayushgarg_xyz)

## License

Rubeus is licensed under the MIT License. See the [LICENSE file](https://github.com/Portkey-AI/Rubeus/blob/worker/LICENSE) for more details.
