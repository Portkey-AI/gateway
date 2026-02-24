import fs from 'fs';
import { getRuntimeKey } from 'hono/adapter';
import path from 'path';

const isNodeInstance = getRuntimeKey() == 'node';

export function getValueOrFileContents(value?: string, ignore?: boolean) {
  if (!value || ignore) return value;

  try {
    // Check if value looks like a file path
    if (
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../')
    ) {
      // Resolve the path (handle relative paths)
      const resolvedPath = path.resolve(value);

      // Check if file exists
      if (fs.existsSync(resolvedPath)) {
        // File exists, read and return its contents
        return fs.readFileSync(resolvedPath, 'utf8').trim();
      }
    }

    // If not a file path or file doesn't exist, return value as is
    return value;
  } catch (error: any) {
    console.log(`Error reading file at ${value}: ${error.message}`);
    // Return the original value if there's an error
    return value;
  }
}

const nodeEnv = {
  NODE_ENV: getValueOrFileContents(process.env.NODE_ENV, true),
  PORT: getValueOrFileContents(process.env.PORT) || 8787,
  MCP_PORT: getValueOrFileContents(process.env.MCP_PORT) || 8788,
  SERVICE_NAME: getValueOrFileContents(process.env.SERVICE_NAME, true),

  SENTRY_DSN: getValueOrFileContents(process.env.SENTRY_DSN),

  MONITOR_METRICS: getValueOrFileContents(process.env.MONITOR_METRICS),
  TEMPO_OTEL_HOST: getValueOrFileContents(process.env.TEMPO_OTEL_HOST),
  ENABLE_TRACING: getValueOrFileContents(process.env.ENABLE_TRACING),
  ENABLE_LOKI: getValueOrFileContents(process.env.ENABLE_LOKI),
  LOKI_PUSH_ENABLED: getValueOrFileContents(process.env.LOKI_PUSH_ENABLED),
  LOKI_AUTH: getValueOrFileContents(process.env.LOKI_AUTH),
  LOKI_HOST: getValueOrFileContents(process.env.LOKI_HOST),
  ENABLE_PROMETHEUS: getValueOrFileContents(process.env.ENABLE_PROMETHEUS),
  PROMETHEUS_GATEWAY_URL: getValueOrFileContents(
    process.env.PROMETHEUS_GATEWAY_URL
  ),
  PROMETHEUS_GATEWAY_AUTH: getValueOrFileContents(
    process.env.PROMETHEUS_GATEWAY_AUTH
  ),
  PROMETHEUS_PUSH_ENABLED: getValueOrFileContents(
    process.env.PROMETHEUS_PUSH_ENABLED
  ),

  GATEWAY_BASE_URL: getValueOrFileContents(process.env.GATEWAY_BASE_URL),
  GATEWAY_CACHE_MODE: getValueOrFileContents(process.env.GATEWAY_CACHE_MODE),
  PORTKEY_PROXY_URL: getValueOrFileContents(process.env.PORTKEY_PROXY_URL),
  PORTKEY_API_KEY: getValueOrFileContents(process.env.PORTKEY_API_KEY),
  GATEWAY_BASEPATH: getValueOrFileContents(process.env.GATEWAY_BASEPATH),
  CONTROL_PLANE_BASEPATH: getValueOrFileContents(
    process.env.CONTROL_PLANE_BASEPATH
  ),
  COHERE_API_KEY: getValueOrFileContents(process.env.COHERE_API_KEY),
  OPEN_AI_PROMPT_SLUG: getValueOrFileContents(process.env.OPEN_AI_PROMPT_SLUG),
  ANTHROPIC_PROMPT_SLUG: getValueOrFileContents(
    process.env.ANTHROPIC_PROMPT_SLUG
  ),
  OPEN_AI_STRUCTURED_PROMPT_SLUG: getValueOrFileContents(
    process.env.OPEN_AI_STRUCTURED_PROMPT_SLUG
  ),
  OPEN_AI_PROMPT_IMPROVEMENT_SLUG: getValueOrFileContents(
    process.env.OPEN_AI_PROMPT_IMPROVEMENT_SLUG
  ),
  ANTHROPIC_PROMPT_TUNE_SLUG: getValueOrFileContents(
    process.env.ANTHROPIC_PROMPT_TUNE_SLUG
  ),
  PORTKEY_PROMPT_GENERATIONS_API_KEY: getValueOrFileContents(
    process.env.PORTKEY_PROMPT_GENERATIONS_API_KEY
  ),

  DATASERVICE_BASEPATH: getValueOrFileContents(
    process.env.DATASERVICE_BASEPATH
  ),
  ALBUS_BASEPATH: getValueOrFileContents(process.env.ALBUS_BASEPATH),
  PORTKEY_CF_URL: getValueOrFileContents(process.env.PORTKEY_CF_URL),
  CF_ENDPOINT: getValueOrFileContents(process.env.CF_ENDPOINT),
  CF_ACCOUNT_ID: getValueOrFileContents(process.env.CF_ACCOUNT_ID),
  CF_NAMESPACE_ID: getValueOrFileContents(process.env.CF_NAMESPACE_ID),
  CF_AUTH_TOKEN: getValueOrFileContents(process.env.CF_AUTH_TOKEN),

  TLS_KEY_PATH: getValueOrFileContents(process.env.TLS_KEY_PATH, true),
  TLS_CERT_PATH: getValueOrFileContents(process.env.TLS_CERT_PATH, true),
  TLS_CA_PATH: getValueOrFileContents(process.env.TLS_CA_PATH, true),

  TLS_KEY: getValueOrFileContents(process.env.TLS_KEY, true),
  TLS_CERT: getValueOrFileContents(process.env.TLS_CERT, true),
  TLS_CA: getValueOrFileContents(process.env.TLS_CA, true),

  HOME: getValueOrFileContents(process.env.HOME, true),
  USERPROFILE: getValueOrFileContents(process.env.USERPROFILE, true),
  AWS_S3_FINETUNE_BUCKET: getValueOrFileContents(
    process.env.AWS_S3_FINETUNE_BUCKET
  ),
  AWS_S3_GENERATIONS_BUCKET: getValueOrFileContents(
    process.env.AWS_S3_GENERATIONS_BUCKET
  ),
  AWS_ACCESS_KEY_ID: getValueOrFileContents(process.env.AWS_ACCESS_KEY_ID),
  AWS_SECRET_ACCESS_KEY: getValueOrFileContents(
    process.env.AWS_SECRET_ACCESS_KEY
  ),
  AWS_SESSION_TOKEN: getValueOrFileContents(process.env.AWS_SESSION_TOKEN),
  AWS_ROLE_ARN: getValueOrFileContents(process.env.AWS_ROLE_ARN),
  AWS_PROFILE: getValueOrFileContents(process.env.AWS_PROFILE, true),
  AWS_WEB_IDENTITY_TOKEN_FILE: getValueOrFileContents(
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
    true
  ),
  AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: getValueOrFileContents(
    process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE,
    true
  ),
  AWS_CONTAINER_CREDENTIALS_FULL_URI: getValueOrFileContents(
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
    true
  ),
  AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: getValueOrFileContents(
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
    true
  ),
  AWS_ASSUME_ROLE_ACCESS_KEY_ID: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_ACCESS_KEY_ID
  ),
  AWS_ASSUME_ROLE_SECRET_ACCESS_KEY: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_SECRET_ACCESS_KEY
  ),
  AWS_ASSUME_ROLE_REGION: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_REGION
  ),
  AWS_ASSUME_ROLE_SOURCE_ARN: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_SOURCE_ARN
  ),
  AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID: getValueOrFileContents(
    process.env.AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID
  ),
  AWS_REGION: getValueOrFileContents(process.env.AWS_REGION),
  AWS_DEFAULT_REGION: getValueOrFileContents(process.env.AWS_DEFAULT_REGION),
  AWS_ENDPOINT_DOMAIN: getValueOrFileContents(process.env.AWS_ENDPOINT_DOMAIN),
  AWS_IMDS_V1: getValueOrFileContents(process.env.AWS_IMDS_V1),
  ECS_CONTAINER_METADATA_URI_V4: getValueOrFileContents(
    process.env.ECS_CONTAINER_METADATA_URI_V4
  ),
  ECS_CONTAINER_METADATA_URI: getValueOrFileContents(
    process.env.ECS_CONTAINER_METADATA_URI
  ),

  WASABI_GENERATIONS_BUCKET: getValueOrFileContents(
    process.env.WASABI_GENERATIONS_BUCKET
  ),
  WASABI_ACCESS_KEY: getValueOrFileContents(process.env.WASABI_ACCESS_KEY),
  WASABI_SECRET_KEY: getValueOrFileContents(process.env.WASABI_SECRET_KEY),
  WASABI_REGION: getValueOrFileContents(process.env.WASABI_REGION),

  PRIVATE_DEPLOYMENT: getValueOrFileContents(process.env.PRIVATE_DEPLOYMENT),
  HYBRID_DEPLOYMENT: getValueOrFileContents(process.env.HYBRID_DEPLOYMENT),
  MANAGED_DEPLOYMENT: getValueOrFileContents(process.env.MANAGED_DEPLOYMENT),
  PRIVATE_CLIENT_AUTH:
    getValueOrFileContents(process.env.PRIVATE_CLIENT_AUTH) ||
    'client_auth-PRIVATE_SEVICE',
  PORTKEY_CLIENT_AUTH: getValueOrFileContents(process.env.PORTKEY_CLIENT_AUTH),
  DISABLE_ORG_CREATION: getValueOrFileContents(
    process.env.DISABLE_ORG_CREATION
  ),
  ORGANISATIONS_TO_SYNC: getValueOrFileContents(
    process.env.ORGANISATIONS_TO_SYNC
  ),
  CONFIG_READER_PATH: getValueOrFileContents(
    process.env.CONFIG_READER_PATH,
    true
  ),
  MODEL_CONFIGS_PROXY_FETCH_ENABLED: getValueOrFileContents(
    process.env.MODEL_CONFIGS_PROXY_FETCH_ENABLED
  ),

  OPENAI_API_KEY: getValueOrFileContents(process.env.OPENAI_API_KEY),

  JWT_ENABLED: getValueOrFileContents(process.env.JWT_ENABLED),
  ALBUS_BASE_URL: getValueOrFileContents(process.env.ALBUS_BASE_URL),
  CONTROL_PLANE_URL:
    getValueOrFileContents(process.env.CONTROL_PLANE_URL) ||
    getValueOrFileContents(process.env.CONTROL_PANEL_URL) ||
    'https://app.portkey.ai',
  CONTROL_PANEL_URL:
    getValueOrFileContents(process.env.CONTROL_PANEL_URL) ||
    'https://app.portkey.ai',

  AUTH_MODE: getValueOrFileContents(process.env.AUTH_MODE),
  AUTH_SSO_TYPE: getValueOrFileContents(process.env.AUTH_SSO_TYPE),
  OIDC_CODE_VERIFIER:
    getValueOrFileContents(process.env.OIDC_CODE_VERIFIER) ||
    'j8XpF3mKqL9wRtY2cN7vD4bZ5hA6sG1uE0iO2xCfM3nBkP',
  OIDC_ISSUER: getValueOrFileContents(process.env.OIDC_ISSUER),
  OIDC_CLIENT_ID: getValueOrFileContents(process.env.OIDC_CLIENT_ID),
  OIDC_CLIENT_SECRET: getValueOrFileContents(process.env.OIDC_CLIENT_SECRET),
  OIDC_REDIRECT_URI:
    process.env.OIDC_REDIRECT_URI || 'https://app.portkey.ai/v2/auth/callback',
  JWT_PRIVATE_KEY: getValueOrFileContents(process.env.JWT_PRIVATE_KEY),
  SAML_METADATA_XML: getValueOrFileContents(process.env.SAML_METADATA_XML),
  SAML_BASE_URL: `${process.env.ALBUS_BASE_URL || 'https://albus.portkey.ai'}/v2/auth/saml`,

  SMTP_MAIL: process.env.SMTP_MAIL,
  SMTP_PORT: getValueOrFileContents(process.env.SMTP_PORT),
  SMTP_HOST: getValueOrFileContents(process.env.SMTP_HOST),
  SMTP_USER: getValueOrFileContents(process.env.SMTP_USER),
  SMTP_PASSWORD: getValueOrFileContents(process.env.SMTP_PASSWORD),
  SMTP_FROM: getValueOrFileContents(process.env.SMTP_FROM),

  MAILGUN_PRIVATE_API_KEY: getValueOrFileContents(
    process.env.MAILGUN_PRIVATE_API_KEY
  ),
  MAILGUN_BASE_URL_OWLS: getValueOrFileContents(
    process.env.MAILGUN_BASE_URL_OWLS
  ),
  MAILGUN_BASE_URL_ALERTS: getValueOrFileContents(
    process.env.MAILGUN_BASE_URL_ALERTS
  ),

  DB_HOST: getValueOrFileContents(process.env.DB_HOST),
  DB_USER: getValueOrFileContents(process.env.DB_USER),
  DB_PASS: getValueOrFileContents(process.env.DB_PASS),
  DB_NAME: getValueOrFileContents(process.env.DB_NAME),
  DB_PORT: getValueOrFileContents(process.env.DB_PORT),
  DB_SSL: getValueOrFileContents(process.env.DB_SSL),

  ANALYTICS_STORE: getValueOrFileContents(process.env.ANALYTICS_STORE),
  ANALYTICS_STORE_ENDPOINT: getValueOrFileContents(
    process.env.ANALYTICS_STORE_ENDPOINT
  ),
  ANALYTICS_STORE_PORT: getValueOrFileContents(
    process.env.ANALYTICS_STORE_PORT
  ),
  ANALYTICS_STORE_USER: getValueOrFileContents(
    process.env.ANALYTICS_STORE_USER
  ),
  ANALYTICS_STORE_PASSWORD: getValueOrFileContents(
    process.env.ANALYTICS_STORE_PASSWORD
  ),
  CLICKHOUSE_DATABASE: getValueOrFileContents(process.env.CLICKHOUSE_DATABASE),
  CLICKHOUSE_HOST: getValueOrFileContents(process.env.CLICKHOUSE_HOST),
  CLICKHOUSE_USER: getValueOrFileContents(process.env.CLICKHOUSE_USER),
  CLICKHOUSE_PORT: getValueOrFileContents(process.env.CLICKHOUSE_PORT),
  CLICKHOUSE_PASSWORD: getValueOrFileContents(process.env.CLICKHOUSE_PASSWORD),
  DISABLE_CLICKHOUSE: getValueOrFileContents(process.env.DISABLE_CLICKHOUSE),
  IGNORE_CLICKHOUSE_STARTUP: getValueOrFileContents(
    process.env.IGNORE_CLICKHOUSE_STARTUP
  ),

  REDIS_URL: getValueOrFileContents(process.env.REDIS_URL),
  REDIS_PORT: getValueOrFileContents(process.env.REDIS_PORT),
  REDIS_HOST: getValueOrFileContents(process.env.REDIS_HOST),
  REDIS_TLS_ENABLED: getValueOrFileContents(process.env.REDIS_TLS_ENABLED),
  REDIS_MODE: getValueOrFileContents(process.env.REDIS_MODE),
  REDIS_TLS_CERTS: getValueOrFileContents(process.env.REDIS_TLS_CERTS, true),
  REDIS_USERNAME: getValueOrFileContents(process.env.REDIS_USERNAME),
  REDIS_PASSWORD: getValueOrFileContents(process.env.REDIS_PASSWORD),
  CACHE_STORE: getValueOrFileContents(process.env.CACHE_STORE),
  AZURE_REDIS_AUTH_MODE: getValueOrFileContents(
    process.env.AZURE_REDIS_AUTH_MODE
  ),
  AZURE_REDIS_ENTRA_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_REDIS_ENTRA_CLIENT_ID
  ),
  AZURE_REDIS_ENTRA_CLIENT_SECRET: getValueOrFileContents(
    process.env.AZURE_REDIS_ENTRA_CLIENT_SECRET
  ),
  AZURE_REDIS_ENTRA_TENANT_ID: getValueOrFileContents(
    process.env.AZURE_REDIS_ENTRA_TENANT_ID
  ),
  AZURE_REDIS_MANAGED_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_REDIS_MANAGED_CLIENT_ID
  ),
  AWS_REDIS_AUTH_MODE: getValueOrFileContents(process.env.AWS_REDIS_AUTH_MODE),
  AWS_REDIS_CLUSTER_NAME: getValueOrFileContents(
    process.env.AWS_REDIS_CLUSTER_NAME
  ),
  AWS_REDIS_REGION: getValueOrFileContents(process.env.AWS_REDIS_REGION),
  AWS_REDIS_ASSUME_ROLE_ARN: getValueOrFileContents(
    process.env.AWS_REDIS_ASSUME_ROLE_ARN
  ),
  AWS_REDIS_ROLE_EXTERNAL_ID: getValueOrFileContents(
    process.env.AWS_REDIS_ROLE_EXTERNAL_ID
  ),
  LOG_STORE: getValueOrFileContents(process.env.LOG_STORE),
  LOG_STORE_ACCESS_KEY: getValueOrFileContents(
    process.env.LOG_STORE_ACCESS_KEY
  ),
  LOG_STORE_SECRET_KEY: getValueOrFileContents(
    process.env.LOG_STORE_SECRET_KEY
  ),
  LOG_STORE_REGION: getValueOrFileContents(process.env.LOG_STORE_REGION),
  LOG_STORE_FILE_PATH_FORMAT: getValueOrFileContents(
    process.env.LOG_STORE_FILE_PATH_FORMAT
  ),

  MONGO_DB_CONNECTION_URL: getValueOrFileContents(
    process.env.MONGO_DB_CONNECTION_URL
  ),
  MONGO_COLLECTION_NAME: getValueOrFileContents(
    process.env.MONGO_COLLECTION_NAME
  ),
  MONGO_DATABASE: getValueOrFileContents(process.env.MONGO_DATABASE),
  MONGO_GENERATION_HOOKS_COLLECTION_NAME: getValueOrFileContents(
    process.env.MONGO_GENERATION_HOOKS_COLLECTION_NAME
  ),

  AZURE_STORAGE_ACCOUNT: getValueOrFileContents(
    process.env.AZURE_STORAGE_ACCOUNT
  ),
  AZURE_STORAGE_KEY: getValueOrFileContents(process.env.AZURE_STORAGE_KEY),
  AZURE_STORAGE_CONTAINER: getValueOrFileContents(
    process.env.AZURE_STORAGE_CONTAINER
  ),
  AZURE_AUTH_MODE: getValueOrFileContents(process.env.AZURE_AUTH_MODE),
  AZURE_ENTRA_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_ENTRA_CLIENT_ID
  ),
  AZURE_ENTRA_CLIENT_SECRET: getValueOrFileContents(
    process.env.AZURE_ENTRA_CLIENT_SECRET
  ),
  AZURE_ENTRA_TENANT_ID: getValueOrFileContents(
    process.env.AZURE_ENTRA_TENANT_ID
  ),
  AZURE_MANAGED_CLIENT_ID: getValueOrFileContents(
    process.env.AZURE_MANAGED_CLIENT_ID
  ),
  AZURE_MANAGED_VERSION: getValueOrFileContents(
    process.env.AZURE_MANAGED_VERSION
  ),
  AZURE_IDENTITY_ENDPOINT: getValueOrFileContents(
    process.env.IDENTITY_ENDPOINT,
    true
  ),
  AZURE_MANAGED_IDENTITY_HEADER: getValueOrFileContents(
    process.env.IDENTITY_HEADER
  ),
  GCP_AUTH_MODE: getValueOrFileContents(process.env.GCP_AUTH_MODE),
  GCP_REDIS_AUTH_MODE: getValueOrFileContents(process.env.GCP_REDIS_AUTH_MODE),
  LOG_STORE_GENERATIONS_BUCKET: getValueOrFileContents(
    process.env.LOG_STORE_GENERATIONS_BUCKET
  ),
  LOG_STORE_AWS_ROLE_ARN: getValueOrFileContents(
    process.env.LOG_STORE_AWS_ROLE_ARN
  ),
  LOG_STORE_AWS_EXTERNAL_ID: getValueOrFileContents(
    process.env.LOG_STORE_AWS_EXTERNAL_ID
  ),
  LOG_STORE_BASEPATH: getValueOrFileContents(
    process.env.LOG_STORE_BASEPATH,
    true
  ),
  LOG_STORE_OBJECT_LOCK_RETENTION_ENABLED: getValueOrFileContents(
    process.env.LOG_STORE_OBJECT_LOCK_RETENTION_ENABLED
  ),

  SSE_ENCRYPTION_TYPE: getValueOrFileContents(process.env.SSE_ENCRYPTION_TYPE),
  KMS_KEY_ID: getValueOrFileContents(process.env.KMS_KEY_ID),
  KMS_BUCKET_KEY_ENABLED: getValueOrFileContents(
    process.env.KMS_BUCKET_KEY_ENABLED
  ),
  KMS_ENCRYPTION_CONTEXT: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CONTEXT
  ),
  KMS_ENCRYPTION_ALGORITHM: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_ALGORITHM
  ),
  KMS_ENCRYPTION_CUSTOMER_KEY: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CUSTOMER_KEY
  ),
  KMS_ENCRYPTION_CUSTOMER_KEY_MD5: getValueOrFileContents(
    process.env.KMS_ENCRYPTION_CUSTOMER_KEY_MD5
  ),

  KMS_ROLE_ARN: getValueOrFileContents(process.env.KMS_ROLE_ARN),
  PRIVATE_LINK_ENDPOINT: getValueOrFileContents(
    process.env.PRIVATE_LINK_ENDPOINT
  ),
  CLIENT_ID: getValueOrFileContents(process.env.CLIENT_ID),
  POLYJUICE_FINETUNE_ENDPOINT: getValueOrFileContents(
    process.env.POLYJUICE_FINETUNE_ENDPOINT
  ),
  STRIPE_SECRET_KEY: getValueOrFileContents(process.env.STRIPE_SECRET_KEY),
  ZAPIER_MAILJET_ZAP_TRIGGER_ENDPOINT: getValueOrFileContents(
    process.env.ZAPIER_MAILJET_ZAP_TRIGGER_ENDPOINT
  ),

  VECTOR_STORE: getValueOrFileContents(process.env.VECTOR_STORE),
  VECTOR_STORE_ADDRESS: getValueOrFileContents(
    process.env.VECTOR_STORE_ADDRESS
  ),
  VECTOR_STORE_API_KEY: getValueOrFileContents(
    process.env.VECTOR_STORE_API_KEY
  ),
  VECTOR_STORE_COLLECTION_NAME: getValueOrFileContents(
    process.env.VECTOR_STORE_COLLECTION_NAME
  ),

  SEMANTIC_CACHE_EMBEDDING_PROVIDER: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_EMBEDDING_PROVIDER
  ),
  SEMANTIC_CACHE_EMBEDDINGS_URL: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_EMBEDDINGS_URL
  ),
  SEMANTIC_CACHE_EMBEDDING_MODEL: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_EMBEDDING_MODEL
  ),
  SEMANTIC_CACHE_EMBEDDING_API_KEY: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_EMBEDDING_API_KEY
  ),
  SEMANTIC_CACHE_SIMILARITY_THRESHOLD: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_SIMILARITY_THRESHOLD
  ),
  SEMANTIC_CACHE_EMBEDDING_DIMENSIONS: getValueOrFileContents(
    process.env.SEMANTIC_CACHE_EMBEDDING_DIMENSIONS
  ),

  OTEL_PUSH_ENABLED: getValueOrFileContents(process.env.OTEL_PUSH_ENABLED),
  OTEL_ENDPOINT: getValueOrFileContents(process.env.OTEL_ENDPOINT),
  OTEL_EXPORTER_OTLP_HEADERS: getValueOrFileContents(
    process.env.OTEL_EXPORTER_OTLP_HEADERS
  ),
  OTEL_RESOURCE_ATTRIBUTES: getValueOrFileContents(
    process.env.OTEL_RESOURCE_ATTRIBUTES
  ),
  OTEL_SERVICE_NAME: getValueOrFileContents(process.env.OTEL_SERVICE_NAME),
  OTEL_EXPORTER_OTLP_PROTOCOL: getValueOrFileContents(
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL
  ),

  EXPERIMENTAL_GEN_AI_OTEL_PUSH_ENABLED: getValueOrFileContents(
    process.env.EXPERIMENTAL_GEN_AI_OTEL_TRACES_ENABLED
  ),
  EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_ENDPOINT: getValueOrFileContents(
    process.env.EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_ENDPOINT
  ),
  EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_HEADERS: getValueOrFileContents(
    process.env.EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_HEADERS
  ),

  ANALYTICS_FEEDBACK_TABLE: getValueOrFileContents(
    process.env.ANALYTICS_FEEDBACK_TABLE
  ),
  ANALYTICS_LOG_TABLE: getValueOrFileContents(process.env.ANALYTICS_LOG_TABLE),
  ANALYTICS_GENERATION_HOOKS_TABLE: getValueOrFileContents(
    process.env.ANALYTICS_GENERATION_HOOKS_TABLE
  ),
  PROMETHEUS_LABELS_METADATA_ALLOWED_KEYS: getValueOrFileContents(
    process.env.PROMETHEUS_LABELS_METADATA_ALLOWED_KEYS
  ),

  HTTP_PROXY: getValueOrFileContents(process.env.HTTP_PROXY),
  HTTPS_PROXY: getValueOrFileContents(process.env.HTTPS_PROXY),
  NO_PROXY: getValueOrFileContents(process.env.NO_PROXY),

  ORGANISATION_HEADERS_TO_MASK: getValueOrFileContents(
    process.env.ORGANISATION_HEADERS_TO_MASK
  ),

  MAX_JSON_PAYLOAD_SIZE_IN_MB: getValueOrFileContents(
    process.env.MAX_JSON_PAYLOAD_SIZE_IN_MB
  ),

  ANALYTICS_REPLICATION_ENABLED: getValueOrFileContents(
    process.env.ANALYTICS_REPLICATION_ENABLED
  ),
  ANALYTICS_REPLICA_ENDPOINTS: getValueOrFileContents(
    process.env.ANALYTICS_REPLICA_ENDPOINTS
  ),
  ANALYTICS_REPLICA_WRITE_PREFIX: getValueOrFileContents(
    process.env.ANALYTICS_REPLICA_WRITE_PREFIX
  ),
  REDIS_SCALE_READS: getValueOrFileContents(process.env.REDIS_SCALE_READS),
  MCP_GATEWAY_BASE_URL: getValueOrFileContents(
    process.env.MCP_GATEWAY_BASE_URL
  ),
  REDIS_CLUSTER_ENDPOINTS: getValueOrFileContents(
    process.env.REDIS_CLUSTER_ENDPOINTS
  ),
  REDIS_CLUSTER_DISCOVERY_URL: getValueOrFileContents(
    process.env.REDIS_CLUSTER_DISCOVERY_URL
  ),
  REDIS_CLUSTER_DISCOVERY_AUTH: getValueOrFileContents(
    process.env.REDIS_CLUSTER_DISCOVERY_AUTH
  ),
  REQUEST_TIMEOUT: getValueOrFileContents(process.env.REQUEST_TIMEOUT),

  SKIP_DATAPLANE_CONFIG_CHECK: getValueOrFileContents(
    process.env.SKIP_DATAPLANE_CONFIG_CHECK
  ),
  CORS_ALLOWED_ORIGINS: getValueOrFileContents(
    process.env.CORS_ALLOWED_ORIGINS
  ),
  ENABLE_CORS: getValueOrFileContents(process.env.ENABLE_CORS),
  // Extra cors, if specified use them else allow all.
  CORS_ALLOWED_HEADERS: getValueOrFileContents(
    process.env.CORS_ALLOWED_HEADERS || '*'
  ),
  CORS_ALLOWED_EXPOSE_HEADERS: getValueOrFileContents(
    process.env.CORS_ALLOWED_EXPOSE_HEADERS || '*'
  ),
  CORS_ALLOWED_METHODS: getValueOrFileContents(
    process.env.CORS_ALLOWED_METHODS || '*'
  ),

  TRUSTED_CUSTOM_HOSTS: getValueOrFileContents(
    process.env.TRUSTED_CUSTOM_HOSTS
  ),

  MCP_ORGANISATION_ID: getValueOrFileContents(process.env.MCP_ORGANISATION_ID),
  MCP_WORKSPACE_ID: getValueOrFileContents(process.env.MCP_WORKSPACE_ID),
  FETCH_SETTINGS_FROM_FILE: getValueOrFileContents(
    process.env.FETCH_SETTINGS_FROM_FILE
  ),
  AZURE_AUTHORITY_HOST: getValueOrFileContents(
    process.env.AZURE_AUTHORITY_HOST
  ),
  AZURE_TENANT_ID: getValueOrFileContents(process.env.AZURE_TENANT_ID),
  AZURE_CLIENT_ID: getValueOrFileContents(process.env.AZURE_CLIENT_ID),
  AZURE_FEDERATED_TOKEN_FILE: getValueOrFileContents(
    process.env.AZURE_FEDERATED_TOKEN_FILE
  ),
  MCP_ADMIN_ROUTES_ENABLED: getValueOrFileContents(
    process.env.MCP_ADMIN_ROUTES_ENABLED
  ),
  MCP_SYNC_ROUTES_ENABLED: getValueOrFileContents(
    process.env.MCP_SYNC_ROUTES_ENABLED
  ),
  MCP_SYNC_AUTH_TOKEN: getValueOrFileContents(process.env.MCP_SYNC_AUTH_TOKEN),
};

export const Environment = (env: Record<string, any> = {}) => {
  if (isNodeInstance) {
    return nodeEnv;
  }
  return env;
};
