# Run locally via NPX
```
npx @portkey-ai/gateway
```

# Managed Deployment
[Portkey.ai](https://portkey.ai) hosts the AI gateway for easy usage. You can [create an account](https://app.portkey.ai) on Portkey and try the gateway. Here are the [docs to get started](https://portkey.ai/docs/welcome/make-your-first-request).

# Deploy to Cloudflare Workers

Method 1

1. Create an API token in Cloudflare
Select "My Profile" from the dropdown menu of your user icon on the top right of your dashboard. Select "API Tokens" > "Create Token". Under "Custom Token", select "Get started". Name your API token in the "Token name" field. Under "Permissions", select "Account", "Cloudflare Pages" and "Edit". Then "Continue". Now your Cloudflare API token is created. 

2. Clone the repo
```
git clone https://github.com/portkey-ai/gateway
```
3. Create a repo secret at the repo setting
Under your repo's name (the one you just cloned), select "Settings". Then select "Secrets" > "Actions" > "New repository secret". Create a secret and put CLOUDFLARE_API_TOKEN as the name with the value being your Cloudflare API token. 

Example of GitHub workflow .yml file for cloudflare worker deployment
```
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```   


Method 2
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
