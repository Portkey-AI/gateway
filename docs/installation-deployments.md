# How to Deploy the Gateway?

1. [Managed Deployment by Portkey](#managed-deployment) for quick setup without infrastructure concerns
2. [Local Deployment](#local-deployment) for complete control & customization
3. [Enterprise Deployment](#enterprise-deployment) for advanced features and dedicated support

## Managed Deployment

Portkey runs this same Gateway on our API and processes **billions of tokens** daily. Portkey's API is in production with companies like Postman, Haptik, Turing, MultiOn, SiteGPT, and more.

Sign up for the free developer plan (10K request/month) [here](https://app.portkey.ai/) or [discuss here](https://calendly.com/rohit-portkey/noam) for enterprise deployments.

Check out the [API docs](https://portkey.ai/docs/welcome/make-your-first-request) here.

## Local Deployment

1. Do [NPM](#node) or [Bun](#bun) Install
2. Run a [Node.js Server](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#run-a-nodejs-server)
3. Deploy on [Cloudflare Workers](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-to-cloudflare-workers)
4. Deploy using [Docker](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-using-docker)
5. Deploy using [Docker Compose](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-using-docker-compose)
6. Deploy on [Replit](#replit)
7. Deploy on [Zeabur](https://github.com/Portkey-AI/gateway/blob/main/docs/installation-deployments.md#deploy-to-zeabur)

### Node

```sh
$ npx @portkey-ai/gateway
```

<br>

### Bun

```sh
$ bunx @portkey-ai/gateway
```

<br>

### Cloudflare Workers

1. Clone the Repository

```sh
git clone https://github.com/portkey-ai/gateway
```

2. Install the NPM Dependencies

```sh
cd gateway
npm install
```

3. Deploy (using [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/))

```sh
npm run deploy
```

<br>

### NodeJS Server

1. Clone the Repository

```sh
git clone https://github.com/portkey-ai/gateway
```

2. Install the NPM Dependencies

```sh
cd gateway
npm i
npm run build
```

<br>

3. Run the Server

```sh
node build/start-server.js
```

<br>

### Docker

**Run using Docker directly:**

```sh
docker run -d -p 8787:8787 portkeyai/gateway:latest
```

For more information on the Docker image, check [here](https://hub.docker.com/r/portkeyai/gateway)

<br>

### Docker Compose

1. Download Compose File from the Repository:

```sh
wget "https://raw.githubusercontent.com/Portkey-AI/gateway/main/docker-compose.yaml"
```

2. Run:

```sh
docker compose up -d
```
> The service is now running and listening on port 8787

<br>

### Replit

[![Deploy on Replit](https://replit.com/badge?caption=Deploy%20on%20Replit)](https://replit.com/@portkey/AI-Gateway?v=1)

<br>

### Zeabur

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/RU38E3)

<br>

### Vercel

Docs to be written, please help!

<br>

### Fastly

Docs to be written, please help!

<br>

### AWS Lambda

Docs to be written, please help!

<br>

### Lambda@edge

Docs to be written, please help!

<br>

### Supabase Functions

Docs to be written, please help!

<br>

## Enterprise Deployment
Make your AI app more <ins>reliable</ins> and <ins>forward compatible</ins>, while ensuring complete <ins>data security</ins> and <ins>privacy</ins>.

✅&nbsp; Secure Key Management - for role-based access control and tracking <br>
✅&nbsp; Simple & Semantic Caching - to serve repeat queries faster & save costs <br>
✅&nbsp; Access Control & Inbound Rules - to control which IPs and Geos can connect to your deployments <br>
✅&nbsp; PII Redaction - to automatically remove sensitive data from your requests to prevent indavertent exposure <br>
✅&nbsp; SOC2, ISO, HIPAA, GDPR Compliances - for best security practices <br>
✅&nbsp; Professional Support - along with feature prioritization <br>

[Schedule a call to discuss enterprise deployments](https://calendly.com/rohit-portkey/noam)

<br>
