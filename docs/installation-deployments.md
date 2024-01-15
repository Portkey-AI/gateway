# Run locally via NPX
```
npx @portkey-ai/gateway
```

# Managed Deployment
[Portkey.ai](https://portkey.ai) hosts the AI gateway for easy usage. You can [create an account](https://app.portkey.ai) on Portkey and try the gateway. Here are the [docs to get started](https://portkey.ai/docs/welcome/make-your-first-request).

# Deploy to Cloudflare Workers

1. Clone the repo
```
git clone https://github.com/portkey-ai/gateway
```
2. Install NPM dependencies
```
cd gateway
npm i
```
3. Deploy using wrangler
```
npm run deploy
```

# Run a Node.js server
1. Clone the repo
```
git clone https://github.com/portkey-ai/gateway
```
2. Install NPM dependencies
```
cd gateway
npm i
npm run build
```
3. Run the node server
```
node build/start-server.js
```

# Deploy using Docker
Run using Docker directly:
```
docker run -d -p 8787:8787 portkeyai/gateway:latest
```
For more information on the Docker image, check [here](https://hub.docker.com/r/portkeyai/gateway)

# Deploy using Docker Compose
1. Download compose file from the repo:
```
wget "https://raw.githubusercontent.com/Portkey-AI/gateway/main/docker-compose.yaml"
```
2. Run:
```
docker compose up -d
```
3. The service is now running and listening on port 8787

# Deploy to Vercel
Docs to be written, please help!

# Deploy to Fastly
Docs to be written, please help!

# Deploy to AWS Lambda
Docs to be written, please help!

# Deploy to Lambda@edge
Docs to be written, please help!

# Deploy to Supabase functions
Docs to be written, please help!
