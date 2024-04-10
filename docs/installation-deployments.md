# Install, Run & Deploy AI Gateway

## Locally

Ensure [NodeJS is installed](https://nodejs.org/en/learn/getting-started/how-to-install-nodejs).

To quick-run the AI gateway locally:

**Node**

```sh
$ npx @portkey-ai/gateway
Your AI Gateway is now running on http://localhost:8787 🚀
```

**Bun**

```sh
$ bunx @portkey-ai/gateway
Your AI Gateway is now running on http://localhost:8787 🚀
```

## Cloudflare Workers

Clone the Repository

```sh
git clone https://github.com/portkey-ai/gateway
```

Install the NPM dependencies

```sh
cd gateway
npm install
```

Deploy (uses [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/))

```sh
npm run deploy
```

## NodeJS Service

Clone the Repository and install NPM dependencies

```sh
git clone https://github.com/portkey-ai/gateway
cd gateway
npm i
npm run build
```

Run the server

```sh
node build/start-server.js
```

## Docker

To run using Docker

```sh
docker run -d -p 8787:8787 portkeyai/gateway:latest
```

## Docker Compose

Download compose file

```sh
wget "https://raw.githubusercontent.com/Portkey-AI/gateway/main/docker-compose.yaml"
```

Run

```sh
docker compose up -d
# running and listening on port 8787
```

## Replit

Replit is cloud based IDE. You can deploy the AI gateway for your apps.

[![Deploy on Replit](https://replit.com/badge?caption=Deploy%20on%20Replit)](https://replit.com/@portkey/AI-Gateway?v=1)

## Deploy to Zeabur

Click on the button below to deploy.

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/RU38E3)

## Deploy to Vercel

Docs to be written, please help!

## Deploy to Fastly

Docs to be written, please help!

## Deploy to AWS Lambda

Docs to be written, please help!

## Deploy to Lambda@edge

Docs to be written, please help!

## Deploy to Supabase functions

Docs to be written, please help!
