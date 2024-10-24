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
2. Run a [Node.js Server](#nodejs-server)
3. Deploy on [App Stack](#deploy-to-app-stack)
4. Deploy on [Cloudflare Workers](#cloudflare-workers)
5. Deploy using [Docker](#docker)
6. Deploy using [Docker Compose](#docker-compose)
7. Deploy on [Replit](#replit)
8. Deploy on [Zeabur](#zeabur)
9. Deploy on [Vercel](#vercel)
10. Deploy using [Fastly](#fastly)
11. Deploy on [AWS Lambda](#aws-lambda)
12. Deploy on [Lambda@edge](#lambda-edge)
13. Deploy with [Supabase Functions](#supabase-functions)

---

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

--- 

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

3. Run the Server

```sh
node build/start-server.js
```

<br>

---

### Deploy to App Stack
F5 Distributed Cloud
1. [Create an App Stack Site](https://docs.cloud.f5.com/docs/how-to/site-management/create-voltstack-site)

2. Retrieve the global kubeconfig
```shell
export DISTRIBUTED_CLOUD_TENANT=mytenantname
# find tenant id in the F5 Distributed Cloud GUI at
# Account -> Account Settings -> Tenant Overview -> Tenant ID
export DISTRIBUTED_CLOUD_TENANT_ID=mytenantnamewithextensionfoundintheconsole
# create an API token in the F5 Distributed Cloud GUI at
# Account -> Account Settings -> Credentials -> Add Credentials 
# set Credential Type to API Token, not API Certificate
export DISTRIBUTED_CLOUD_API_TOKEN=myapitoken
export DISTRIBUTED_CLOUD_SITE_NAME=appstacksitename
export DISTRIBUTED_CLOUD_NAMESPACE=mydistributedcloudnamespace
export DISTRIBUTED_CLOUD_APP_STACK_NAMESPACE=portkeyai
export DISTRIBUTED_CLOUD_APP_STACK_SITE=myappstacksite
export DISTRIBUTED_CLOUD_SERVICE_NAME=portkeyai
# adjust the expiry date to a time no more than 90 days in the future
export KUBECONFIG_CERT_EXPIRE_DATE="2021-09-14T09:02:25.547659194Z"
export PORTKEY_GATEWAY_FQDN=the.host.nameof.theservice
export PORTKEY_PROVIDER=openai
export PORTKEY_PROVIDER_AUTH_TOKEN=authorizationtoken

curl --location --request POST 'https://$DISTRIBUTED_CLOUD_TENANT.console.ves.volterra.io/api/web/namespaces/system/sites/$DISTRIBUTED_CLOUD_SITE_NAME/global-kubeconfigs' \
--header 'Authorization: APIToken $DISTRIBUTED_CLOUD_API_TOKEN' \
--header 'Access-Control-Allow-Origin: *' \
--header 'x-volterra-apigw-tenant: $DISTRIBUTED_CLOUD_TENANT'\
--data-raw '{"expirationTimestamp":"$KUBECONFIG_CERT_EXPIRE_DATE"}'
``` 
Save the response in a YAML file for later use.  
[more detailed instructions for retrieving the App Stack kubeconfig file](https://f5cloud.zendesk.com/hc/en-us/articles/4407917988503-How-to-download-kubeconfig-via-API-or-vesctl)  

3. Copy the deployment YAML
```shell
wget https://raw.githubusercontent.com/Portkey-AI/gateway/main/deployment.yaml
```

4. Apply the manifest
```shell
export KUBECONFIG=path/to/downloaded/global/kubeconfig/in/step/two
# apply the file downloaded in step 3
kubectl apply -f deployment.yaml
```
5. Create Origin Pool
```shell
# create origin pool
curl --request POST \
  --url https://$DISTRIBUTED_CLOUD_TENANT.console.ves.volterra.io/api/config/namespaces/$DISTRIBUTED_CLOUD_NAMESPACE/origin_pools \
  --header 'authorization: APIToken $DISTRIBUTED_CLOUD_API_TOKEN' \
  --header 'content-type: application/json' \
  --data '{"metadata": {"name": "$DISTRIBUTED_CLOUD_SERVICE_NAME","namespace": "$DISTRIBUTED_CLOUD_NAMESPACE","labels": {},"annotations": {},"description": "","disable": false},"spec": {"origin_servers": [{"k8s_service": {"service_name": "$DISTRIBUTED_CLOUD_SERVICE_NAME.$DISTRIBUTED_CLOUD_APP_STACK_NAMESPACE","site_locator": {"site": {"tenant": "$DISTRIBUTED_CLOUD_TENANT_ID","namespace": "system","name": "$DISTRIBUTED_CLOUD_APP_STACK_SITE"}},"inside_network": {}},"labels": {}}],"no_tls": {},"port": 8787,"same_as_endpoint_port": {},"healthcheck": [],"loadbalancer_algorithm": "LB_OVERRIDE","endpoint_selection": "LOCAL_PREFERRED","advanced_options": null}}'
```
or [use the UI](https://docs.cloud.f5.com/docs/how-to/app-networking/origin-pools)

6. Create an HTTP Load Balancer, including header injection of Portkey provider and credentials
```shell
curl --request POST \
  --url https://$DISTRIBUTED_CLOUD_TENANT.console.ves.volterra.io/api/config/namespaces/$DISTRIBUTED_CLOUD_NAMESPACE/http_loadbalancers \
  --header 'authorization: APIToken $DISTRIBUTED_CLOUD_API_TOKEN' \
  --header 'content-type: application/json' \
  --data '{"metadata": {"name": "$DISTRIBUTED_CLOUD_SERVICE_NAME","namespace": "$DISTRIBUTED_CLOUD_NAMESPACE","labels": {},"annotations": {},"description": "","disable": false},"spec": {"domains": ["$PORTKEY_GATEWAY_FQDN"],"https_auto_cert": {"http_redirect": true,"add_hsts": false,"tls_config": {"default_security": {}},"no_mtls": {},"default_header": {},"enable_path_normalize": {},"port": 443,"non_default_loadbalancer": {},"header_transformation_type": {"default_header_transformation": {}},"connection_idle_timeout": 120000,"http_protocol_options": {"http_protocol_enable_v1_v2": {}}},"advertise_on_public_default_vip": {},"default_route_pools": [{"pool": {"tenant": "$DISTRIBUTED_CLOUD_TENANT_ID","namespace": "$DISTRIBUTED_CLOUD_NAMESPACE","name": "$DISTRIBUTED_CLOUD_SERVICE_NAME"},"weight": 1,"priority": 1,"endpoint_subsets": {}}],"origin_server_subset_rule_list": null,"routes": [],"cors_policy": null,"disable_waf": {},"add_location": true,"no_challenge": {},"more_option": {"request_headers_to_add": [{"name": "x-portkey-provider","value": "$PORTKEY_PROVIDER","append": false},{"name": "Authorization","value": "Bearer $PORTKEY_PROVIDER_AUTH_TOKEN","append": false}],"request_headers_to_remove": [],"response_headers_to_add": [],"response_headers_to_remove": [],"max_request_header_size": 60,"buffer_policy": null,"compression_params": null,"custom_errors": {},"javascript_info": null,"jwt": [],"idle_timeout": 30000,"disable_default_error_pages": false,"cookies_to_modify": []},"user_id_client_ip": {},"disable_rate_limit": {},"malicious_user_mitigation": null,"waf_exclusion_rules": [],"data_guard_rules": [],"blocked_clients": [],"trusted_clients": [],"api_protection_rules": null,"ddos_mitigation_rules": [],"service_policies_from_namespace": {},"round_robin": {},"disable_trust_client_ip_headers": {},"disable_ddos_detection": {},"disable_malicious_user_detection": {},"disable_api_discovery": {},"disable_bot_defense": {},"disable_api_definition": {},"disable_ip_reputation": {},"disable_client_side_defense": {},"csrf_policy": null,"graphql_rules": [],"protected_cookies": [],"host_name": "","dns_info": [],"internet_vip_info": [],"system_default_timeouts": {},"jwt_validation": null,"disable_threat_intelligence": {},"l7_ddos_action_default": {},}}'
```
or [use the UI](https://docs.cloud.f5.com/docs/how-to/app-networking/http-load-balancer)

7. Test the service
```shell
curl --request POST \
  --url https://$PORTKEY_GATEWAY_FQDN/v1/chat/completions \
  --header 'content-type: application/json' \
  --data '{"messages": [{"role": "user","content": "Say this might be a test."}],"max_tokens": 20,"model": "gpt-4"}'
```
in addition to the response headers, you should get a response body like
```json
{
  "id": "chatcmpl-abcde......09876",
  "object": "chat.completion",
  "created": "0123456789",
  "model": "gpt-4-0321",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "This might be a test."
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 6,
    "total_tokens": 20
  },
  "system_fingerprint": null
}
```

---

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

For more details, refer to [Cloudflare Workers official](https://developers.cloudflare.com/workers/).
<br>

---

### Docker

**Run using Docker directly:**

```sh
docker run -d -p 8787:8787 portkeyai/gateway:latest
```

For more information on the Docker image, check [here](https://hub.docker.com/r/portkeyai/gateway)

<br>

--- 

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

For more details, refer to [Docker Compose official](https://docs.docker.com/compose/).
<br>

---

### Replit

[![Deploy on Replit](https://replit.com/badge?caption=Deploy%20on%20Replit)](https://replit.com/@portkey/AI-Gateway?v=1)

---

### Zeabur

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/RU38E3)

---

### Vercel

1. Clone the Repository
   
```sh
git clone https://github.com/portkey-ai/gateway
```

2. Set up a new project in Vercel by linking the repository.

3. Configure environment variables in Vercel's dashboard, matching those in the `deployment.yaml` file (e.g., `PORTKEY_PROVIDER`, `PORTKEY_PROVIDER_AUTH_TOKEN`).

4. Adjust the project to use Vercel’s serverless function framework if needed.

5. Deploy your application.
   
For more details, refer to [Vercel's documentation](https://vercel.com/docs/deployments/git/vercel-for-github).

<br>

---

### Fastly

1. Follow Fastly’s [Compute@Edge tutorial](https://www.fastly.com/documentation/guides/compute/).

2. Clone the Gateway Repository:

```sh
git clone https://github.com/portkey-ai/gateway
```

3. Install Fastly’s CLI:

```sh
npm install -g @fastly/cli
```

4. Create a new Fastly service and link it to your cloned Gateway repo.

5. Modify the `gateway` code to fit into Fastly's Compute@Edge runtime, considering its unique environment for handling edge requests.

6. Deploy the service using Fastly CLI:

```sh
fastly compute publish
```

For more details, refer to [Fastly’s official](https://www.fastly.com/).

<br>

---

### AWS Lambda

1. Clone the Repository:
```sh
git clone https://github.com/portkey-ai/gateway
```

2. Create a new AWS Lambda function via the AWS Management Console.

3. Use AWS Lambda Layers to include the necessary Node.js/Bun dependencies (e.g., `npm`).

4. Zip the Gateway project (excluding `node_modules`) and upload it to your Lambda function.

5. Configure environment variables for your Lambda function.

6. Set up an API Gateway for HTTP requests and route them to your Lambda function.

For more detailed steps, refer to the AWS Lambda [deployment documentation](https://docs.aws.amazon.com/lambda/).

<br>

---

### Lambda edge

1. Clone the Repository:
   
```sh
git clone https://github.com/portkey-ai/gateway
```

2. Prepare the project for Lambda@Edge deployment by ensuring that request handling works within CloudFront constraints.

3. Set up an AWS CloudFront distribution.

4. Deploy the Lambda function to the edge using the `aws` CLI or AWS Console.

5. Attach the Lambda@Edge function to the CloudFront distribution.

More information is available in AWS’s official [Lambda@Edge documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html).

<br>

---

### Supabase Functions

1. Clone the Repository:
   
```sh
git clone https://github.com/portkey-ai/gateway
```

2. Set up a Supabase project and create a new function.

3. Modify the project to use Supabase’s environment.

4. Deploy using the Supabase CLI:

```sh
supabase functions deploy your-function-name
```

Refer to [Supabase's official documentation](https://supabase.com/docs) for more details.

<br>

---

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
