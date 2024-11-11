
<p align="right">
   <strong>English</strong> | <a href="./.github/README.cn.md">中文</a> 
</p>

<div align="center">

# AI Gateway
#### Route to 250+ LLMs with 1 fast & friendly API

<!-- We can add more quick links here - Docs, Enterprise, Demo, Hosted Gateway, Changelog, API Reference -->

<img src="https://i.ibb.co/bKqkQ81/sdk.gif" height="300px" alt="Gateway Demo" style="margin-left:-35px">

[Docs]() | [Enterprise]() | [Demo]() | [Hosted Gateway]() | [Changelog]() | [API Reference]()


[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges)](./LICENSE)
[![Discord](https://img.shields.io/discord/1143393887742861333)](https://portkey.ai/community)
[![Twitter](https://img.shields.io/twitter/url/https/twitter/follow/portkeyai?style=social&label=Follow%20%40PortkeyAI)](https://twitter.com/portkeyai)
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
<!-- <br> -->

```bash
# Run the gateway locally (needs Node.js and npm)
npx @portkey-ai/gateway
```


![Deploy using](https://img.shields.io/badge/-Other_deployment_guides:-000?style=flat-square&logo=supported&logoColor=F7DF1E&color=white)
[![Portkey](https://img.shields.io/badge/-Portkey_Cloud-000?style=flat-square&logo=data:image/svg%2bxml;base64,PHN2ZyB3aWR0aD0iNjgiIGhlaWdodD0iNjgiIHZpZXdCb3g9IjAgMCA2OCA2OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0yNC41MDA0IDIuNDM1QzE4Ljg3OTIgMi40MzUgMTMuNzE1OCA1LjQ4Njc2IDEwLjkzNTIgMTAuMzkwMUwyLjA4MDc2IDI2LjAwMzZDLTAuNjgyMTU0IDMwLjg3NTYgLTAuNjk0MjU0IDM2Ljg2NTkgMi4wNDg3MyA0MS43NDkyTDEwLjkyNTggNTcuNTUzMkMxMy42OTc3IDYyLjQ4ODIgMTguODc4NSA2NS41NjUgMjQuNTIzIDY1LjU2NUg0MS45NjY0QzQ3LjU3MDYgNjUuNTY1IDUyLjcyMTIgNjIuNTMxNSA1NS41MDgxIDU3LjY1MTNMNjQuNTMyOSA0MS44NDc2QzY3LjM1MDIgMzYuOTE0MSA2Ny4zMzc5IDMwLjgyNzMgNjQuNTAwMiAyNS45MDU1TDU1LjQ5ODEgMTAuMjkxN0w1Mi45ODY0IDExLjczOThMNTUuNDk4MSAxMC4yOTE3QzUyLjcwMjggNS40NDM0NiA0Ny41Njk5IDIuNDM1IDQxLjk4OTEgMi40MzVIMjQuNTAwNFpNMTcuMDM2OCAxMy44NTAzQzE4LjU5MTkgMTEuMTA4MSAyMS40NDUzIDkuNDQ5NDQgMjQuNTAwNCA5LjQ0OTQ0SDQxLjk4OTFDNDUuMDIyNCA5LjQ0OTQ0IDQ3Ljg1ODQgMTEuMDg0NiA0OS40MjEzIDEzLjc5NTNMNTguNDIzNCAyOS40MDkxQzYwLjAxNTkgMzIuMTcxMiA2MC4wMjMgMzUuNiA1OC40NDE3IDM4LjM2OTJMNDkuNDE2OSA1NC4xNzI5QzQ3Ljg1ODUgNTYuOTAxOCA0NS4wMTI0IDU4LjU1MDYgNDEuOTY2NCA1OC41NTA2SDI0LjUyM0MyMS40NTUzIDU4LjU1MDYgMTguNTkxOSA1Ni44NzgzIDE3LjA0MTUgNTQuMTE4TDguMTY0NDQgMzguMzE0QzYuNjI0NjkgMzUuNTcyOCA2LjYzMTYxIDMyLjE5ODMgOC4xODIzNiAyOS40NjM4TDE3LjAzNjggMTMuODUwM1pNMzkuNTk0NiAxOS4yOTU5QzM4LjMyMiAxNy44MzU2IDM2LjEwNjYgMTcuNjgzNCAzNC42NDYzIDE4Ljk1NkMzMy4xODYgMjAuMjI4NSAzMy4wMzM4IDIyLjQ0NCAzNC4zMDYzIDIzLjkwNDNMNDMuMTA0MSAzNEwzNC4zMDYzIDQ0LjA5NTdDMzMuMDMzOCA0NS41NTYgMzMuMTg2IDQ3Ljc3MTUgMzQuNjQ2MyA0OS4wNDRDMzYuMTA2NiA1MC4zMTY2IDM4LjMyMiA1MC4xNjQ0IDM5LjU5NDYgNDguNzA0MUw0OS4zOTYzIDM3LjQ1NjNDNTEuMTIyNSAzNS40NzU0IDUxLjEyMjUgMzIuNTI0NiA0OS4zOTYzIDMwLjU0MzdMMzkuNTk0NiAxOS4yOTU5WiIgZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzEwMzVfMTU1KSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzEwMzVfMTU1IiB4MT0iLTIzLjAwMzQiIHkxPSItMi44OTEyNSIgeDI9IjczIiB5Mj0iODEuOTM1IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CjxzdG9wIG9mZnNldD0iMC4yNTAwNjgiIHN0b3AtY29sb3I9IiMzOUFDRTYiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkYwMDAwIi8+CjwvbGluZWFyR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==&logoColor=3776AB&color=white)](https://app.portkey.ai/signup)
![Docker](https://img.shields.io/badge/-Docker-000?style=flat-square&logo=docker&logoColor=3776AB&color=white)
![Node.js](https://img.shields.io/badge/-Node.js-000?style=flat-square&logo=node.js&logoColor=3776AB&color=white)
![Cloudflare](https://img.shields.io/badge/-Cloudflare-000?style=flat-square&logo=cloudflare&logoColor=3776AB&color=white)
![Replit](https://img.shields.io/badge/-Replit-000?style=flat-square&logo=replit&logoColor=3776AB&color=white)
![F5](https://img.shields.io/badge/-F5_Nginx-000?style=flat-square&logo=nginx&logoColor=3776AB&color=white)

<sup>
Other deployment guides:
&nbsp; <a href="https://docs.portkey.ai/docs/deploy/portkey-cloud"><img height="12" width="12" src="https://cfassets.portkey.ai/logo/dew-color.svg" /> Portkey Cloud (Recommended)</a>
&nbsp; <a href="https://docs.portkey.ai/docs/deploy/docker"><img height="12" width="12" src="https://cdn.simpleicons.org/docker/3776AB" /> Docker</a>
&nbsp; <a href="https://docs.portkey.ai/docs/deploy/nodejs"><img height="12" width="12" src="https://cdn.simpleicons.org/node.js/3776AB" /> Node.js</a>
&nbsp; <a href="https://docs.portkey.ai/docs/deploy/cloudflare"><img height="12" width="12" src="https://cdn.simpleicons.org/cloudflare/3776AB" /> Cloudflare</a>
&nbsp; <a href="https://docs.portkey.ai/docs/deploy/replit"><img height="12" width="12" src="https://cdn.simpleicons.org/replit/3776AB" /> Replit</a>
</sup>

<!-- You could also deploy using [Docker](), [Node.js](), [Cloudflare](), [Replit]() and [more](). -->

<!-- <br> -->

### 2. Make your first request

<!-- <details open>
<summary>Python Example</summary> -->
```python
# pip install -qU portkey-ai

from portkey_ai import Portkey

# Instantiate the client similar to OpenAI's SDK
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
<!-- </pre> -->
<!-- </details> -->

<!-- <details>
  <summary>JS Example</summary>
  <pre lang="javascript">

    // npm install --save portkey-ai

    import { Portkey } from 'portkey-ai';

    const client = new Portkey({
        provider: "openai", // or 'anthropic', 'bedrock', 'groq', etc
        Authorization: "sk-***" // the provider API key
    });

    client.chat.completions.create({
        messages: [{ role: "user", content: "What's the weather like?" }],
        model: "gpt-4o-mini"
    });
  </pre>
</details>

<details>
  <summary>cURL Example</summary>
  <pre lang="shell">

    curl -X POST http://localhost:8787/v1/chat/completions \
      -H "Content-Type: application/json" \
      -H "x-portkey-provider: openai" \
      -H "Authorization: sk-***" \
      -d '{
        "messages": [
            { "role": "user", "content": "Hello, how are you?" },
        ],
        "model": "gpt-4o-mini"
      }'
  </pre>
</details>

<details>
<summary>OpenAI SDK</summary>
<pre lang="python">

    from openai import OpenAI
    from portkey_ai import createHeaders

    client = OpenAI(
      base_url='http://localhost:8787/v1',
      default_headers=createHeaders(
        provider="openai" # or 'anthropic', 'bedrock', 'groq', etc
      )
    )

    client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[{"role": "user", "content": "What is a fractal?"}],
    )
</pre>
</details> -->

<!-- ![JS](https://img.shields.io/badge/-Supported_Libraries:-000?style=flat-square&logo=supported&logoColor=3776AB&color=white)
![JS](https://img.shields.io/badge/-JS-000?style=flat-square&logo=javascript&logoColor=3776AB&color=white)
![Python](https://img.shields.io/badge/-Python-000?style=flat-square&logo=python&logoColor=3776AB&color=white)
![REST](https://img.shields.io/badge/-REST-000?style=flat-square&logo=gnu-bash&logoColor=3776AB&color=white)
![OpenAI](https://img.shields.io/badge/-OpenAI_SDKs-000?style=flat-square&logo=openai&logoColor=3776AB&color=white)
![Langchain](https://img.shields.io/badge/-Langchain-000?style=flat-square&logo=langchain&logoColor=3776AB&color=white)
![LlamaIndex](https://img.shields.io/badge/-LlamaIndex-000?style=flat-square&logo=llama&logoColor=3776AB&color=white)
![Autogen](https://img.shields.io/badge/-Autogen-000?style=flat-square&logo=autogen&logoColor=3776AB&color=white)
![CrewAI](https://img.shields.io/badge/-CrewAI-000?style=flat-square&logo=crewai&logoColor=3776AB&color=white)
![More](https://img.shields.io/badge/-More..-000?style=flat-square&logo=More&logoColor=3776AB&color=white)
 -->
 <sup>Supported Libraries: 
&nbsp; <img height="12" width="12" src="https://cdn.simpleicons.org/javascript/3776AB" /> JS 
&nbsp; <img height="12" width="12" src="https://cdn.simpleicons.org/python/3776AB" /> Python
&nbsp; <img height="12" width="12" src="https://cdn.simpleicons.org/gnubash/3776AB" /> REST
&nbsp; <img height="12" width="12" src="https://cdn.simpleicons.org/openai/3776AB" /> OpenAI SDKs
&nbsp; <img height="12" width="12" src="https://cdn.simpleicons.org/langchain/3776AB" /> Langchain
&nbsp; LlamaIndex
&nbsp; Autogen
&nbsp; CrewAI
&nbsp; More..
</sup>


### 3. Explore Configs & Guardrails
```python
# Config to retry on 446 status code and prevent all replies containing "Apple"
config = {
  "provider":"openai",
  "api_key": "sk-***",

  "retry": {"attempts": 5, "on_status_codes": [446]},

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
```
<img src="https://portkey.ai/blog/content/images/size/w1600/2024/11/image-15.png" height=200 title="Request flow through Portkey's AI gateway with retries and guardrails" alt="Request flow through Portkey's AI gateway with retries and guardrails"/>

You can do a lot more stuff with configs in your AI gateway. [Jump to examples  →](https://portkey.ai/docs/product/ai-gateway/configs)

<br/>


### Enterprise Version (Private deployments)
<!-- Add badges for AWS, Azure, GCP, OpenShift, Kubernetes   -->
![AWS](https://img.shields.io/badge/-AWS-000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9IiMzNzc2QUIiIHdpZHRoPSI4MDBweCIgaGVpZ2h0PSI4MDBweCIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgY2xhc3M9Imljb24iPgogIDxwYXRoIGQ9Ik04MjUgNzY4LjljLTMuMy0uOS03LjMtLjQtMTEuOSAxLjMtNjEuNiAyOC4yLTEyMS41IDQ4LjMtMTc5LjcgNjAuMkM1MDcuNyA4NTYgMzg1LjIgODQyLjYgMjY2IDc5MC4zYy0zMy4xLTE0LjYtNzkuMS0zOS4yLTEzOC03NGE5LjM2IDkuMzYgMCAwIDAtNS4zLTJjLTItLjEtMy43LjEtNS4zLjktMS42LjgtMi44IDEuOC0zLjcgMy4xLS45IDEuMy0xLjEgMy4xLS40IDUuNC42IDIuMiAyLjEgNC43IDQuNiA3LjQgMTAuNCAxMi4yIDIzLjMgMjUuMiAzOC42IDM5czM1LjYgMjkuNCA2MC45IDQ2LjhjMjUuMyAxNy40IDUxLjggMzIuOSA3OS4zIDQ2LjQgMjcuNiAxMy41IDU5LjYgMjQuOSA5Ni4xIDM0LjFzNzMgMTMuOCAxMDkuNCAxMy44YzM2LjIgMCA3MS40LTMuNyAxMDUuNS0xMC45IDM0LjItNy4zIDYzLTE1LjkgODYuNS0yNS45IDIzLjQtOS45IDQ1LTIxIDY0LjgtMzMgMTkuOC0xMiAzNC40LTIyLjIgNDMuOS0zMC4zIDkuNS04LjIgMTYuMy0xNC42IDIwLjItMTkuNCA0LjYtNS43IDYuOS0xMC42IDYuOS0xNC45LjEtNC41LTEuNy03LjEtNS03Ljl6TTUyNy40IDM0OC4xYy0xNS4yIDEuMy0zMy41IDQuMS01NSA4LjMtMjEuNSA0LjEtNDEuNCA5LjMtNTkuOCAxNS40cy0zNy4yIDE0LjYtNTYuMyAyNS40Yy0xOS4yIDEwLjgtMzUuNSAyMy4yLTQ5IDM3cy0yNC41IDMxLjEtMzMuMSA1MmMtOC42IDIwLjgtMTIuOSA0My43LTEyLjkgNjguNyAwIDI3LjEgNC43IDUxLjIgMTQuMyA3Mi41IDkuNSAyMS4zIDIyLjIgMzggMzguMiA1MC40IDE1LjkgMTIuNCAzNCAyMi4xIDU0IDI5LjIgMjAgNy4xIDQxLjIgMTAuMyA2My4yIDkuNCAyMi0uOSA0My41LTQuMyA2NC40LTEwLjMgMjAuOC01LjkgNDAuNC0xNS40IDU4LjYtMjguMyAxOC4yLTEyLjkgMzMuMS0yOC4yIDQ0LjgtNDUuNyA0LjMgNi42IDguMSAxMS41IDExLjUgMTQuN2w4LjcgOC45YzUuOCA1LjkgMTQuNyAxNC42IDI2LjcgMjYuMSAxMS45IDExLjUgMjQuMSAyMi43IDM2LjMgMzMuN2wxMDQuNC05OS45LTYtNC45Yy00LjMtMy4zLTkuNC04LTE1LjItMTQuMy01LjgtNi4yLTExLjYtMTMuMS0xNy4yLTIwLjUtNS43LTcuNC0xMC42LTE2LjEtMTQuNy0yNS45LTQuMS05LjgtNi4yLTE5LjMtNi4yLTI4LjVWMjU4LjdjMC0xMC4xLTEuOS0yMS01LjctMzIuOC0zLjktMTEuNy0xMC43LTI0LjUtMjAuNy0zOC4zLTEwLTEzLjgtMjIuNC0yNi4yLTM3LjItMzctMTQuOS0xMC44LTM0LjctMjAtNTkuNi0yNy40LTI0LjgtNy40LTUyLjYtMTEuMS04My4yLTExLjEtMzEuMyAwLTYwLjQgMy43LTg3LjYgMTAuOS0yNy4xIDcuMy01MC4zIDE3LTY5LjcgMjkuMi0xOS4zIDEyLjItMzUuOSAyNi4zLTQ5LjcgNDIuNC0xMy44IDE2LjEtMjQuMSAzMi45LTMwLjggNTAuNC02LjcgMTcuNS0xMC4xIDM1LjItMTAuMSA1My4xTDQwOCAzMTBjNS41LTE2LjQgMTIuOS0zMC42IDIyLTQyLjggOS4yLTEyLjIgMTcuOS0yMSAyNS44LTI2LjUgOC01LjUgMTYuNi05LjkgMjUuNy0xMy4yIDkuMi0zLjMgMTUuNC01IDE4LjYtNS40IDMuMi0uMyA1LjctLjQgNy42LS40IDI2LjcgMCA0NS4yIDcuOSA1NS42IDIzLjYgNi41IDkuNSA5LjcgMjMuOSA5LjcgNDMuM3Y1Ni42Yy0xNS4yLjYtMzAuNCAxLjYtNDUuNiAyLjl6TTU3My4xIDUwMGMwIDE2LjYtMi4yIDMxLjctNi41IDQ1LTkuMiAyOS4xLTI2LjcgNDcuNC01Mi40IDU0LjgtMjIuNCA2LjYtNDMuNyAzLjMtNjMuOS05LjgtMjEuNS0xNC0zMi4yLTMzLjgtMzIuMi01OS4zIDAtMTkuOSA1LTM2LjkgMTUtNTEuMSAxMC0xNC4xIDIzLjMtMjQuNyA0MC0zMS43czMzLTEyIDQ5LTE0LjljMTUuOS0zIDMzLTQuOCA1MS01LjRWNTAwem0zMzUuMiAyMTguOWMtNC4zLTUuNC0xNS45LTguOS0zNC45LTEwLjctMTktMS44LTM1LjUtMS43LTQ5LjcuNC0xNS4zIDEuOC0zMS4xIDYuMi00Ny4zIDEzLjQtMTYuMyA3LjEtMjMuNCAxMy4xLTIxLjYgMTcuOGwuNyAxLjMuOS43IDEuNC4yaDQuNmMuOCAwIDEuOC0uMSAzLjItLjIgMS40LS4xIDIuNy0uMyAzLjktLjQgMS4yLS4xIDIuOS0uMyA1LjEtLjQgMi4xLS4xIDQuMS0uNCA2LS43LjMgMCAzLjctLjMgMTAuMy0uOSA2LjYtLjYgMTEuNC0xIDE0LjMtMS4zIDIuOS0uMyA3LjgtLjYgMTQuNS0uOSA2LjctLjMgMTIuMS0uMyAxNi4xIDAgNCAuMyA4LjUuNyAxMy42IDEuMSA1LjEuNCA5LjIgMS4zIDEyLjQgMi43IDMuMiAxLjMgNS42IDMgNy4xIDUuMSA1LjIgNi42IDQuMiAyMS4yLTMgNDMuOXMtMTQgNDAuOC0yMC40IDU0LjJjLTIuOCA1LjctMi44IDkuMiAwIDEwLjdzNi43LjEgMTEuOS00YzE1LjYtMTIuMiAyOC42LTMwLjYgMzkuMS01NS4zIDYuMS0xNC42IDEwLjUtMjkuOCAxMy4xLTQ1LjcgMi40LTE1LjkgMi0yNi4yLTEuMy0zMXoiLz4KPC9zdmc+&logoColor=3776AB&color=white)
![Azure](https://img.shields.io/badge/Azure-%230072C6.svg?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgOTYgOTYiPgogICAgPGRlZnM+CiAgICAgICAgPGxpbmVhckdyYWRpZW50IGlkPSJlMzk5YzE5Zi1iNjhmLTQyOWQtYjE3Ni0xOGMyMTE3ZmY3M2MiIHgxPSItMTAzMi4xNzIiIHgyPSItMTA1OS4yMTMiIHkxPSIxNDUuMzEyIiB5Mj0iNjUuNDI2IiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIC0xIDEwNzUgMTU4KSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICAgICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMxMTRhOGIiLz4KICAgICAgICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDY2OWJjIi8+CiAgICAgICAgPC9saW5lYXJHcmFkaWVudD4KICAgICAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImFjMmE2ZmMyLWNhNDgtNDMyNy05YTNjLWQ0ZGNjMzI1NmUxNSIgeDE9Ii0xMDIzLjcyNSIgeDI9Ii0xMDI5Ljk4IiB5MT0iMTA4LjA4MyIgeTI9IjEwNS45NjgiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgMTA3NSAxNTgpIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgICAgICAgIDxzdG9wIG9mZnNldD0iMCIgc3RvcC1vcGFjaXR5PSIuMyIvPgogICAgICAgICAgICA8c3RvcCBvZmZzZXQ9Ii4wNzEiIHN0b3Atb3BhY2l0eT0iLjIiLz4KICAgICAgICAgICAgPHN0b3Agb2Zmc2V0PSIuMzIxIiBzdG9wLW9wYWNpdHk9Ii4xIi8+CiAgICAgICAgICAgIDxzdG9wIG9mZnNldD0iLjYyMyIgc3RvcC1vcGFjaXR5PSIuMDUiLz4KICAgICAgICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLW9wYWNpdHk9IjAiLz4KICAgICAgICA8L2xpbmVhckdyYWRpZW50PgogICAgICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYTdmZWU5NzAtYTc4NC00YmIxLWFmOGQtNjNkMThlNWY3ZGI5IiB4MT0iLTEwMjcuMTY1IiB4Mj0iLTk5Ny40ODIiIHkxPSIxNDcuNjQyIiB5Mj0iNjguNTYxIiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIC0xIDEwNzUgMTU4KSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICAgICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMzY2NiZjQiLz4KICAgICAgICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjg5MmRmIi8+CiAgICAgICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDwvZGVmcz4KICAgIDxwYXRoIGZpbGw9IiMzNzc2QUIiIGQ9Ik0zMy4zMzggNi41NDRoMjYuMDM4bC0yNy4wMyA4MC4wODdhNC4xNTIgNC4xNTIgMCAwIDEtMy45MzMgMi44MjRIOC4xNDlhNC4xNDUgNC4xNDUgMCAwIDEtMy45MjgtNS40N0wyOS40MDQgOS4zNjhhNC4xNTIgNC4xNTIgMCAwIDEgMy45MzQtMi44MjV6Ii8+CiAgICA8cGF0aCBmaWxsPSIjMzc3NkFCIiBkPSJNNzEuMTc1IDYwLjI2MWgtNDEuMjlhMS45MTEgMS45MTEgMCAwIDAtMS4zMDUgMy4zMDlsMjYuNTMyIDI0Ljc2NGE0LjE3MSA0LjE3MSAwIDAgMCAyLjg0NiAxLjEyMWgyMy4zOHoiLz4KICAgIDxwYXRoIGZpbGw9IiMzNzc2QUIiIGQ9Ik0zMy4zMzggNi41NDRhNC4xMTggNC4xMTggMCAwIDAtMy45NDMgMi44NzlMNC4yNTIgODMuOTE3YTQuMTQgNC4xNCAwIDAgMCAzLjkwOCA1LjUzOGgyMC43ODdhNC40NDMgNC40NDMgMCAwIDAgMy40MS0yLjlsNS4wMTQtMTQuNzc3IDE3LjkxIDE2LjcwNWE0LjIzNyA0LjIzNyAwIDAgMCAyLjY2Ni45NzJIODEuMjRMNzEuMDI0IDYwLjI2MWwtMjkuNzgxLjAwN0w1OS40NyA2LjU0NHoiLz4KICAgIDxwYXRoIGZpbGw9IiMzNzc2QUIiIGQ9Ik02Ni41OTUgOS4zNjRhNC4xNDUgNC4xNDUgMCAwIDAtMy45MjgtMi44MkgzMy42NDhhNC4xNDYgNC4xNDYgMCAwIDEgMy45MjggMi44MmwyNS4xODQgNzQuNjJhNC4xNDYgNC4xNDYgMCAwIDEtMy45MjggNS40NzJoMjkuMDJhNC4xNDYgNC4xNDYgMCAwIDAgMy45MjctNS40NzJ6Ii8+Cjwvc3ZnPg==&logoColor=3776AB&color=white)
![GCP](https://img.shields.io/badge/-GCP-000?style=flat-square&logo=google-cloud&logoColor=3776AB&color=white)
![OpenShift](https://img.shields.io/badge/-OpenShift-000?style=flat-square&logo=red-hat&logoColor=3776AB&color=white)
![Kubernetes](https://img.shields.io/badge/-Kubernetes-000?style=flat-square&logo=kubernetes&logoColor=3776AB&color=white)

The AI Gateway's [enterprise version](https://docs.portkey.ai/docs/product/enterprise-offering) offers advanced capabilities for **org management**, **governance**, **security** and [more](https://docs.portkey.ai/docs/product/enterprise-offering) out of the box. [View Feature Comparison →](https://docs.portkey.ai/docs/product/product-feature-comparison)

The enterprise deployment architecture for supported platforms is available here - [**Enterprise Private Cloud Deployments**](https://docs.portkey.ai/docs/product/enterprise-offering/private-cloud-deployments)

<a href="https://app.portkey.ai/signup"><img src="https://portkey.ai/blog/content/images/2024/08/Get-API-Key--5-.png" height=50 alt="Book an enterprise AI gateway demo" /></a><br/>


<br>

## Cookbooks

### ☄️ Trending
- Use models from [Nvidia NIM](/cookbook/providers/nvidia.ipynb) with AI Gateway
- Monitor [CrewAI Agents](/cookbook/monitoring-agents/CrewAI_with_Telemetry.ipynb) with Portkey!
- Comparing [Top 10 LMSYS Models](./use-cases/LMSYS%20Series/comparing-top10-LMSYS-models-with-Portkey.ipynb) with AI Gateway.

### 🚨 Latest
* [Create Synthetic Datasets using Nemotron](/cookbook/use-cases/Nemotron_GPT_Finetuning_Portkey.ipynb)
* [Use Portkey Gateway with Vercel's AI SDK](/cookbook/integrations/vercel-ai.md)
* [Monitor Llama Agents with Portkey](/cookbook/monitoring-agents/Llama_Agents_with_Telemetry.ipynb)

[View all cookbooks →](https://github.com/Portkey-AI/gateway/tree/main/cookbook)
<br/><br/>

## Supported Providers

Explore Gateway integrations with [45+ providers](https://portkey.ai/docs/welcome/integration-guides) and [8+ frameworks](https://portkey.ai/docs/welcome/integration-guides).

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

*Only available on the [hosted app](https://portkey.ai). For detailed documentation [click here](https://docs.portkey.ai/docs/welcome/agents). 


## Features

<table width=100%>
  <tr>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/fallbacks">Fallbacks</a></strong><br/>
      Fallback to another provider or model on failed requests. You can specify the errors on which to trigger the fallback. Improves reliability of your application
      <br><br>
      <img src="https://framerusercontent.com/images/gmlOW8yeKP2pGuIsObM6gKLzeMI.png" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/automatic-retries">Automatic Retries</a></strong><br/>
      Automatically retry failed requests up to 5 times. An exponential backoff strategy spaces out retry attempts to prevent network overload.
      <br><br>
      <img src="https://github.com/roh26it/Rubeus/assets/971978/8a6e653c-94b2-4ba7-95c7-93544ee476b1" height=100 />
    </td>
  </tr>
  
</table>
<table width="100%">
  <tr>
    <td width="50%"> 
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/load-balancing">Load Balancing</a></strong><br/>
      Distribute LLM requests across multiple API keys or AI providers with weights to ensure high availability and optimal performance.
      <br><br>
      <img src="https://framerusercontent.com/images/6EWuq3FWhqrPe3kKLqVspevi4.png" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/request-timeouts">Request Timeouts</a></strong></br><br/>
      Manage unruly LLMs & latencies by setting up granular request timeouts, allowing automatic termination of requests that exceed a specified duration.
      <br><br>
      <img src="https://github.com/vrushankportkey/gateway/assets/134934501/b23b98b2-6451-4747-8898-6847ad8baed4" height=100 />
    </td>
  </tr>
</table>

</table>
<table width="100%">
  <tr>
    <td width="50%"> 
      <strong><a href="https://docs.portkey.ai/docs/product/ai-gateway-streamline-llm-integrations/multimodal-capabilities">Multi-modal LLM Gateway</a></strong><br/>
      Call vision, audio (text-to-speech & speech-to-text), and image generation models from multiple providers  — all using the familiar OpenAI signature
      <br><br>
      <img src="https://docs.portkey.ai/~gitbook/image?url=https%3A%2F%2F2878743244-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252Fy3MCfQqftZOnHqSmVV5x%252Fuploads%252FOVuOxN4uFdBp1BdXX4E6%252Fmultimodal-icon.png%3Falt%3Dmedia%26token%3Db8b7bd49-0194-4d2f-89d4-c6633a872372&width=768&dpr=2&quality=100&sign=f51129a9&sv=1" height=100 />
    </td>
    <td width="50%">
      <strong><a href="https://docs.portkey.ai/docs/product/guardrails">Guardrails</a></strong></br><br/>
      Verify your LLM inputs AND outputs to adhere to your specified checks. Build your own checks or choose from the 20+ pre-built guardrails.
      <br><br>
      <img src="https://docs.portkey.ai/~gitbook/image?url=https%3A%2F%2F2878743244-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252Fy3MCfQqftZOnHqSmVV5x%252Fuploads%252FDFkhZpqtBfQMIW9BhVum%252Fguardrails-icon.png%3Falt%3Dmedia%26token%3D91cfe226-5ce9-44b3-a0e8-be9f3ae3917f&width=768&dpr=2&quality=100&sign=73608afc&sv=1" height=100 />
    </td>
  </tr>
</table>

**These features are configured through the Gateway Config added to the  `x-portkey-config` header or the `config` parameter in the SDKs.**

Here's a sample config JSON showcasing the above features. All the features are optional

```json
{
	"retry": { "attempts": 5 },
	"request_timeout": 10000,
	"strategy": { "mode": "fallback" }, // or 'loadbalance', etc
	"targets": [{
		"provider": "openai",
		"api_key": "sk-***"
	},{
		"strategy": {"mode": "loadbalance"}, // Optional nesting
		"targets": {...}
	}]
}
```

Then use the config in your API requests to the gateway.


### Using Gateway Configs

Here's a guide to [use the config object in your request](https://portkey.ai/docs/api-reference/config-object).

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

The easiest way to contribute is to pick an issue with the `good first issue` tag 💪. Read the contribution guidelines [here](/.github/CONTRIBUTING.md).

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
