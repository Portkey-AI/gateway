# gateway-unified-enterprise
Gateway + All Workers Unified

## Local deployment
```bash
wrangler dev --local
```

The service will be available at `http://localhost:8787`

## Deploying to cloudflare
```bash
wrangler publish --env env --minify
```
env can be `staging` or `prod`

## Add secrets to cloudflare
One by One

```bash
wrangler secret put <key> --env env
```
Bulk

```bash
wrangler secret:bulk <json_file> --env env 
```

## Parameters/Secrets in use 
```
ALBUS_BASEPATH (* auth)
GATEWAY_BASEPATH 
OPENAI_API_KEY (* semcache embeddings)
SEMCACHE_PINECONE_SUBDOMAIN (* semcache vector store)
VECTOR_STORE_API_KEY (* semcache vector store)
ANALYTICS_STORE_ENDPOINT (* analytics)
ANALYTICS_STORE_USER (* analytics)
ANALYTICS_STORE_PASSWORD (* analytics)
ANALYTICS_LOG_TABLE (*** analytics)
ANALYTICS_FEEDBACK_TABLE (*** analytics)
LOG_STORE (* logs)
MONGO_DB_API_KEY (** logs)
MONGO_DB_CLUSTER (** logs)
MONGO_DB_DATABASE (** logs)
MONGO_DB_RAW_GENERATION_COLLECTION (** logs)
MONGO_DB_DATA_API_ENDPOINT (** logs)
LOG_STORE_REGION (** logs)
LOG_STORE_ACCESS_KEY (** logs)
LOG_STORE_SECRET_KEY (** logs)
LOG_STORE_GENERATIONS_BUCKET (** logs)
LOG_STORE_AWS_ROLE_ARN (** logs)
LOG_STORE_AWS_EXTERNAL_ID (** logs)
AWS_ASSUME_ROLE_ACCESS_KEY_ID (** aws assumed)
AWS_ASSUME_ROLE_SECRET_ACCESS_KEY (** aws assumed)
AWS_ASSUME_ROLE_REGION (** aws assumed)
PORTKEY_CLIENT_AUTH (* sync)

* Mandatory
** Optional based on condition
*** Optional
```

### Auth
Authentication is handled by validating `x-portkey-api-key` for all the requests. The validation is done using `ALBUS_BASEPATH` 


### Analytics Storage
The following secrets are mandatory for Analytics data storage

```
ANALYTICS_STORE_ENDPOINT
ANALYTICS_STORE_USER
ANALYTICS_STORE_PASSWORD
ANALYTICS_LOG_TABLE
ANALYTICS_FEEDBACK_TABLE
```

`ANALYTICS_LOG_TABLE` defaults to `portkey_enterprise.generations` if not set

`ANALYTICS_FEEDBACK_TABLE` defaults to `portkey_enterprise.feedbacks` if not set

### Log Storage

`LOG_STORE` can be `mongo`, `s3`, `s3_assume`, `wasabi`, `gcs`, `azure`, or `netapp`.

**1. Mongo**

If you want to use Mongo or Document DB for storage, `LOG_STORE` will be `mongo`. The following values are mandatory
```
  MONGO_DB_CONNECTION_URL: 
  MONGO_DATABASE: 
  MONGO_COLLECTION_NAME: 
```
If you are using pem file for authentication, you need to follow the below additional steps

- In `resources-config.yaml` file supply pem file details under data(for example, document_db.pem) along with its content.
- In `values.yaml` use the below config
```
volumes:
- name: shared-folder
  configMap:
    name: resource-config
volumeMounts:
- name: shared-folder
  mountPath: /etc/shared/<shared_pem>
  subPath: <shared_pem>
```
The `MONGO_DB_CONNECTION_URL` should use /etc/shared<shared_pem> in tlsCAFile param. For example, `mongodb://<user>:<password>@<host>?tls=true&tlsCAFile=/etc/shared/document_db.pem&retryWrites=false`

**2. AWS S3 Compatible Blob storage**

Portkey supports following S3 compatible Blob storages 
- AWS S3
- Google Cloud Storage
- Azure Blob Storage
- Wasabi
- Netapp (s3 compliant APIs)

The above mentioned S3 Compatible document storages are interopable with S3 API. 

The following values are mandatory
```
  LOG_STORE_REGION: 
  LOG_STORE_ACCESS_KEY: 
  LOG_STORE_SECRET_KEY: 
  LOG_STORE_GENERATIONS_BUCKET:
```

You need to  generate `Access Key` and `Secret Key` from the respective providers as mentioned below.

**2.1. AWS S3**

`LOG_STORE` will be `s3`.

Access Key can be generated as mentioned here - 

https://aws.amazon.com/blogs/security/wheres-my-secret-access-key

Security Credentials -> Access Keys -> Create Access Keys

**2.2. Google Cloud Storage**

`LOG_STORE` will be `gcs`.

Only s3 interoble way of gcs is supported currently. 

Access Key can be generated as mentioned here - 

https://cloud.google.com/storage/docs/interoperability

https://cloud.google.com/storage/docs/authentication/hmackeys

Cloud Storage -> Settings -> Interopability -> Access keys for service accounts -> Create Key for Service Accounts

**2.3. Wasabi**

`LOG_STORE` will be `wasabi`.

Access Key can be generated from

Access Keys ->  Create Access Key

**2.4. Azure Blob Storage**

If you want to use Azure blob storage, `LOG_STORE` will be `azure`. 

The following values are mandatory
```
  AZURE_STORAGE_ACCOUNT: 
  AZURE_STORAGE_KEY: 
  AZURE_STORAGE_CONTAINER: 
```

**2.5. S3 Assumed Role**

If you want to use s3 using Assumed Role Authentication, the log store will be `s3_assume`. 

The following values are mandatory

```
  LOG_STORE_REGION
  LOG_STORE_GENERATIONS_BUCKET
  LOG_STORE_ACCESS_KEY
  LOG_STORE_SECRET_KEY
  LOG_STORE_AWS_ROLE_ARN
  LOG_STORE_AWS_EXTERNAL_ID
```

`LOG_STORE_ACCESS_KEY`,`LOG_STORE_SECRET_KEY` will be supplied by Portkey. Rest needs to be provisioned and supplied.

`LOG_STORE_AWS_ROLE_ARN` and `LOG_STORE_AWS_EXTERNAL_ID` need to be enabled by following the below steps

**2.6. Netapp**

If you want to use Netapp's S3 compiant store, the log store will be `netapp`. 

The following values are mandatory

```
  LOG_STORE_REGION
  LOG_STORE_ACCESS_KEY
  LOG_STORE_SECRET_KEY
  LOG_STORE_BASEPATH
```


1. Go to the IAM console in the AWS Management Console.
2. Click "Roles" in the left sidebar, then "Create role".
3. Choose "Another AWS account" as the trusted entity.
4. Enter the Account ID of the Portkey Aws Account Id (which will be shared).
5. Select "Require external Id" for added security.
6. Attach the necessary permissions: 
- AmazonS3FullAccess (or a more restrictive custom policy for S3)
7. Name the role (e.g., "S3AssumedRolePortkey") and create it.
8. After creating the role, select it and go to the "Trust relationships" tab.
9. Edit the trust relationship and ensure it looks similar to this:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "<arn_shared_by_portkey>"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId":"<LOG_STORE_AWS_EXTERNAL_ID>"
        }
      }
    }
  ]
}
```
`LOG_STORE_AWS_ROLE_ARN` will be the same as arn for the above role.

Note: Share the `LOG_STORE_AWS_ROLE_ARN` created with Portkey.

### Aws Assumed Role (for Bedrock)

If Aws assumed Role is used for authentication Bedrock, following keys are mandatory
```
  AWS_ASSUME_ROLE_ACCESS_KEY_ID
  AWS_ASSUME_ROLE_SECRET_ACCESS_KEY 
  AWS_ASSUME_ROLE_REGION
```

Follow, similar steps to `S3 Assumed Role` in Log Store section above. In step #6, following accesses are needed
- AmazonBedrockFullAccess (or a more restrictive custom policy for Bedrock)

### Cache
```
  SEMCACHE_PINECONE_SUBDOMAIN
  VECTOR_STORE_API_KEY
  OPENAI_API_KEY
```
 are required for semantic caching

### Sticky Load Balancing

Sticky load balancing ensures that requests with the same identifier are consistently routed to the same provider target. This is useful for maintaining session state, debugging, or ensuring consistent behavior across multiple requests.

#### Configuration

Sticky sessions are configured at the strategy level within your config:

{
  "strategy": {
    "mode": "loadbalance",
    "sticky": {
      "enabled": true,
      "hash_fields": ["metadata.user_id"],
      "ttl": 300
    }
  },
  "targets": [
    { "provider": "openai", "api_key": "key1", "weight": 1 },
    { "provider": "openai", "api_key": "key2", "weight": 1 }
  ]
}

#### Configuration Options

- **enabled** (boolean, required): Enables or disables sticky sessions
- **hash_fields** (array of strings, optional): Fields to include in the sticky identifier hash
  - Example: `["metadata.user_id", "metadata.tenant_id", "headers.x-portkey-api-key", "params.stream"]`
- **ttl** (number, optional): Time-to-live for sticky sessions in seconds. Defaults to 300 (5 minutes)

#### How It Works

1. When a request arrives with sticky sessions enabled, a hash is generated from the specified `hash_fields`
2. If a cached target exists for that hash, the request is routed to the cached target
3. If no cached target exists, weighted random selection is performed and the result is cached
4. After the TTL expires, a new target will be selected on the next request

#### Example Request

curl -X POST https://gateway.example.com/v1/chat/completions \
  -H "x-portkey-api-key: your-api-key" \
  -H "x-portkey-metadata: {\"user_id\": \"user123\", \"session_id\": \"sess456\"}" \
  -H "x-portkey-config: {...}" \
  -d '{"model": "gpt-4", "messages": [...]}'

#### Use Cases

- **Session Continuity**: Ensure all requests from a user session go to the same provider
- **Debugging**: Consistently route specific API keys to the same provider for troubleshooting
- **Rate Limiting**: Distribute load per user while maintaining stickiness
- **Cost Management**: Route specific tenants to specific provider instances

#### Limitations

- If a target becomes unavailable or the target list changes, a new target will be selected on the next request
- The maximum TTL is determined by Redis configuration
- Sticky sessions add a small latency overhead for cache lookups (typically <1ms for L1 hits)

### Transactional Data Sync
```
  PORTKEY_CLIENT_AUTH
  ORGANISATIONS_TO_SYNC
```
This is used to sync transactional data (configs, virtual keys, api keys, prompts, prompt partials and guard rails) from the control plane.

## Changes in wrangler.toml

### 1. KV Name space
Replace `id` and `preview_id` for `kv_namespaces` in `wrangler.toml` file for all environments

```
kv_namespaces = [
  { binding = "KV_STORE", id = "<id>", preview_id = "<id>" }
]
```

## GitHub Workflow to Publish Docker Image Tag on New Release

### Docker Repo Name: `portkeyai/gateway_enterprise`

1. **Prepare for Release:**
- Once all feature branches are tested and merged to `main`, create a new branch from main named `feat/release-{{new-version-to-be-released}}` (e.g., `feat/release-1.8.0`). Make sure there are **no unstaged or uncommitted changes** at this point.
	```

	git checkout -b feat/release-1.8.0

	```

2. **Bump Version:**

- While on the release branch, execute one of these commands to update the version:

-  `patch` bumps the last digit.

-  `minor` bumps the middle digit.
	```

	npm version patch

	npm version minor

	```
- This will automatically update and commit `package.json` and `package-lock.json`. Do a `git push`. 

3. **Raise and Merge PR:**
- Raise a PR from the release branch to `main` and merge it. This prepares the main branch for the release.

4. **Create GitHub Release:**
- Go to the **Releases** section on GitHub and create a new release with the same version used in the above step. This will automatically trigger the GitHub Action for Docker publish.

5. **Docker Image Publishing:**
- The GitHub Action will create a new version tagged with the release version. And it will overwrite the existing `latest` tag. Example:
	```

	portkeyai/gateway_enterprise:1.8.0

	portkeyai/gateway_enterprise:latest

	```