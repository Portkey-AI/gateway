# How to Deploy the Gateway?

1. [Managed Deployment by Portkey](#managed-deployment) for quick setup without infrastructure concerns
2. [Local Deployment](#local-deployment) for complete control & customization
3. [Enterprise Deployment](#enterprise-deployment) for advanced features and dedicated support

## Managed Deployment

Portkey runs this same Gateway on our API and processes **billions of tokens** daily. Portkey's API is in production with companies like Postman, Haptik, Turing, MultiOn, SiteGPT, and more.

Sign up for the free developer plan [here](https://app.portkey.ai/) or [discuss here](https://calendly.com/portkey-ai/quick-meeting?utm_source=github&utm_campaign=install_page) for enterprise deployments.

Check out the [API docs](https://portkey.ai/docs/welcome/make-your-first-request) here.

## Local Deployment

1. Run through [NPX](#node) or [BunX](#bun) Install
2. Run a [Node.js Server](#nodejs-server)
3. Deploy using [Docker](#docker)
4. Deploy using [Docker Compose](#docker-compose)
5. Deploy on [Cloudflare Workers](#cloudflare-workers)
6. Deploy on [App Stack](#deploy-to-app-stack)
7. Deploy on [Replit](#replit)
8. Deploy on [Zeabur](#zeabur)

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
5. Create an HTTP Load Balancer, including header injection of Portkey provider and credentials
```shell
curl --request POST \
  --url https://$DISTRIBUTED_CLOUD_TENANT.console.ves.volterra.io/api/config/namespaces/$DISTRIBUTED_CLOUD_NAMESPACE/http_loadbalancers \
  --header 'authorization: APIToken $DISTRIBUTED_CLOUD_API_TOKEN' \
  --header 'content-type: application/json' \
  --data '{"metadata": {"name": "$DISTRIBUTED_CLOUD_SERVICE_NAME","namespace": "$DISTRIBUTED_CLOUD_NAMESPACE","labels": {},"annotations": {},"description": "","disable": false},"spec": {"domains": ["$PORTKEY_GATEWAY_FQDN"],"https_auto_cert": {"http_redirect": true,"add_hsts": false,"tls_config": {"default_security": {}},"no_mtls": {},"default_header": {},"enable_path_normalize": {},"port": 443,"non_default_loadbalancer": {},"header_transformation_type": {"default_header_transformation": {}},"connection_idle_timeout": 120000,"http_protocol_options": {"http_protocol_enable_v1_v2": {}}},"advertise_on_public_default_vip": {},"default_route_pools": [{"pool": {"tenant": "$DISTRIBUTED_CLOUD_TENANT_ID","namespace": "$DISTRIBUTED_CLOUD_NAMESPACE","name": "$DISTRIBUTED_CLOUD_SERVICE_NAME"},"weight": 1,"priority": 1,"endpoint_subsets": {}}],"origin_server_subset_rule_list": null,"routes": [],"cors_policy": null,"disable_waf": {},"add_location": true,"no_challenge": {},"more_option": {"request_headers_to_add": [{"name": "x-portkey-provider","value": "$PORTKEY_PROVIDER","append": false},{"name": "Authorization","value": "Bearer $PORTKEY_PROVIDER_AUTH_TOKEN","append": false}],"request_headers_to_remove": [],"response_headers_to_add": [],"response_headers_to_remove": [],"max_request_header_size": 60,"buffer_policy": null,"compression_params": null,"custom_errors": {},"javascript_info": null,"jwt": [],"idle_timeout": 30000,"disable_default_error_pages": false,"cookies_to_modify": []},"user_id_client_ip": {},"disable_rate_limit": {},"malicious_user_mitigation": null,"waf_exclusion_rules": [],"data_guard_rules": [],"blocked_clients": [],"trusted_clients": [],"api_protection_rules": null,"ddos_mitigation_rules": [],"service_policies_from_namespace": {},"round_robin": {},"disable_trust_client_ip_headers": {},"disable_ddos_detection": {},"disable_malicious_user_detection": {},"disable_api_discovery": {},"disable_bot_defense": {},"disable_api_definition": {},"disable_ip_reputation": {},"disable_client_side_defense": {},"csrf_policy": null,"graphql_rules": [],"protected_cookies": [],"host_name": "","dns_info": [],"internet_vip_info": [],"system_default_timeouts": {},"jwt_validation": null,"disable_threat_intelligence": {},"l7_ddos_action_default": {},}}'
```
or [use the UI](https://docs.cloud.f5.com/docs/how-to/app-networking/http-load-balancer)
6. Test the service
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

**Run through the latest Docker Hub image:**

```sh
docker run --rm  -p 8787:8787 portkeyai/gateway:latest
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

### AWS EC2
1. Copy the AWS CloudFormation template from below:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Parameters:
  VpcId:
    Type: AWS::EC2::VPC::Id
    Description: VPC where the EC2 instance will be launched
  SubnetId:
    Type: AWS::EC2::Subnet::Id
    Description: Subnet where the EC2 instance will be launched
  InstanceType:
    Type: String
    Default: t2.micro
    AllowedValues:
      - t2.micro
      - t2.small
      - t2.medium
      - t3.micro
      - t3.small
    Description: EC2 instance type

Resources:
  EC2Instance:
    Type: AWS::EC2::Instance
    Properties:
      ImageId: !FindInMap [RegionMap, !Ref "AWS::Region", AMI]
      InstanceType: !Ref InstanceType
      SecurityGroupIds:
        - !Ref InstanceSecurityGroup
      SubnetId: !Ref SubnetId
      UserData:
        Fn::Base64: |
          #!/bin/bash
          sudo yum update -y
          sudo yum install -y amazon-linux-extras
          sudo amazon-linux-extras enable docker
          sudo yum install -y docker
          sudo systemctl start docker
          sudo systemctl enable docker
          sudo docker run -p 8787:8787 -d portkeyai/gateway:latest
      Tags:
        - Key: Name
          Value: PortkeyGateway

  InstanceSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Portkey Gateway
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 8787
          ToPort: 8787
          CidrIp: 0.0.0.0/0
      SecurityGroupEgress:
        - IpProtocol: -1
          FromPort: -1
          ToPort: -1
          CidrIp: 0.0.0.0/0

Mappings:
  RegionMap:
    Metadata:
      Name: amzn2-ami-hvm-2.0.20250220.0-x86_64-gp2
      Owner: amazon
      CreationDate: 2025-02-20T22:38:11.000Z
    eu-west-1:
      AMI: ami-049b732d3f35a4f44
    ca-central-1:
      AMI: ami-06816da431adb7634
    eu-west-2:
      AMI: ami-0eebf19cec0b40d10
    us-east-2:
      AMI: ami-0e7b3e7766d24a6ff
    eu-west-3:
      AMI: ami-004f2229fb9afa698
    eu-north-1:
      AMI: ami-08fbe5a8c8061068f
    us-west-1:
      AMI: ami-01891d4f3898759b2
    ap-northeast-3:
      AMI: ami-0316e0efae0ce53d2
    us-east-1:
      AMI: ami-0ace34e9f53c91c5d
    ap-northeast-2:
      AMI: ami-0891aeb92f786d7a2
    sa-east-1:
      AMI: ami-081d377a25d396ece
    us-west-2:
      AMI: ami-04c0ab8f1251f1600
    ap-northeast-1:
      AMI: ami-00561c77487da40c1
    ap-south-1:
      AMI: ami-0f4f6fd19fad11737
    ap-southeast-2:
      AMI: ami-044b50caba366ec3a
    ap-southeast-1:
      AMI: ami-0301dd2fb476c9850
    eu-central-1:
      AMI: ami-014eb100f18a84d89


Outputs:
  PortkeyGatewayURL:
    Description: URL to access Portkey Gateway
    Value: !Sub http://${EC2Instance.PublicDnsName}:8787
```

2. Create a new stack in the AWS CloudFormation console with the template above(you can upload in your S3 or directly upload the template).

3. Fill the following parameters:
- **VpcId**: The VPC ID of the VPC where the EC2 instance will be launched
- **SubnetId**: The Subnet ID of the Subnet where the EC2 instance will be launched
- **InstanceType**: The instance type of the EC2 instance

4. Create the stack and wait for it to be created.

5. Once the stack is created, you can access the Portkey Gateway URL from the Outputs section.

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

[Schedule a call to discuss enterprise deployments](https://calendly.com/portkey-ai/quick-meeting?utm_source=github&utm_campaign=install_page)

<br>
