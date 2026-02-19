import {
  ANTHROPIC,
  ANYSCALE,
  AZURE_OPEN_AI,
  COHERE,
  HEADER_KEYS,
  OLLAMA,
  OPEN_AI,
  TOGETHER_AI,
} from '../../globals';

/**
 * Portkey header keys used for request/response processing.
 *
 * NOTE: Some of these keys are being migrated to use Hono context instead
 * of headers for internal data passing. Keys marked as @deprecated are used
 * only for inter-middleware communication and should instead use context helpers
 * (see contextHelpers.ts) in new code.
 */
export const PORTKEY_HEADER_KEYS = {
  API_KEY: 'x-portkey-api-key',
  MODE: 'x-portkey-mode',
  CONFIG: 'x-portkey-config',
  CACHE: 'x-portkey-cache',
  CACHE_TTL: 'x-portkey-cache-ttl',
  CACHE_REFRESH: 'x-portkey-cache-force-refresh',
  CACHE_STATUS: 'x-portkey-cache-status',
  RETRIES: 'x-portkey-retry-count',
  TRACE_ID: 'x-portkey-trace-id',
  METADATA: 'x-portkey-metadata',
  PROMPT_VERSION_ID: 'x-portkey-prompt-version-id',
  PROMPT_ID: 'x-portkey-prompt-id',
  CONFIG_ID: 'x-portkey-config-id',
  /**
   * @deprecated Used for inter-middleware communication.
   * Prefer using `getContext(c, ContextKeys.ORGANISATION_DETAILS)` from contextHelpers.ts
   */
  ORGANISATION_DETAILS: 'x-auth-organisation-details',
  RUNTIME: 'x-portkey-runtime',
  RUNTIME_VERSION: 'x-portkey-runtime-version',
  PACKAGE_VERSION: 'x-portkey-package-version',
  CONFIG_VERSION: 'x-portkey-config-version',
  PROVIDER: 'x-portkey-provider',
  VIRTUAL_KEY: 'x-portkey-virtual-key',
  VIRTUAL_KEY_EXHAUSTED: 'x-portkey-virtual-key-exhausted',
  VIRTUAL_KEY_EXPIRED: 'x-portkey-virtual-key-expired',
  VIRTUAL_KEY_USAGE_LIMITS: 'x-portkey-virtual-key-usage-limits',
  VIRTUAL_KEY_RATE_LIMITS: 'x-portkey-virtual-key-rate-limits',
  /**
   * @deprecated Used for inter-middleware communication.
   * Prefer using `getContext(c, ContextKeys.VIRTUAL_KEY_DETAILS)` from contextHelpers.ts
   */
  VIRTUAL_KEY_DETAILS: 'x-portkey-virtual-key-details',
  /**
   * @deprecated Used for inter-middleware communication.
   * Prefer using `getContext(c, ContextKeys.INTEGRATION_DETAILS)` from contextHelpers.ts
   */
  INTEGRATION_DETAILS: 'x-portkey-integration-details',
  CONFIG_SLUG: 'x-portkey-config-slug',
  PROMPT_SLUG: 'x-portkey-prompt-slug',
  AZURE_RESOURCE: 'x-portkey-azure-resource-name',
  AZURE_DEPLOYMENT: 'x-portkey-azure-deployment-id',
  AZURE_API_VERSION: 'x-portkey-azure-api-version',
  AZURE_MODEL_NAME: 'x-portkey-azure-model-name',
  REFRESH_PROMPT_CACHE: 'x-portkey-refresh-prompt-cache',
  CACHE_CONTROL: 'cache-control',
  CACHE_NAME_SPACE: 'x-portkey-cache-namespace',
  AWS_AUTH_TYPE: 'x-portkey-aws-auth-type',
  AWS_ROLE_ARN: 'x-portkey-aws-role-arn',
  AWS_EXTERNAL_ID: 'x-portkey-aws-external-id',
  BEDROCK_ACCESS_KEY_ID: 'x-portkey-aws-access-key-id',
  BEDROCK_SECRET_ACCESS_KEY: 'x-portkey-aws-secret-access-key',
  BEDROCK_REGION: 'x-portkey-aws-region',
  BEDROCK_SESSION_TOKEN: 'x-portkey-aws-session-token',
  SAGEMAKER_CUSTOM_ATTRIBUTES: 'x-portkey-amzn-sagemaker-custom-attributes',
  SAGEMAKER_TARGET_MODEL: 'x-portkey-amzn-sagemaker-target-model',
  SAGEMAKER_TARGET_VARIANT: 'x-portkey-amzn-sagemaker-target-variant',
  SAGEMAKER_TARGET_CONTAINER_HOSTNAME:
    'x-portkey-amzn-sagemaker-target-container-hostname',
  SAGEMAKER_INFERENCE_ID: 'x-portkey-amzn-sagemaker-inference-id',
  SAGEMAKER_ENABLE_EXPLANATIONS: 'x-portkey-amzn-sagemaker-enable-explanations',
  SAGEMAKER_INFERENCE_COMPONENT: 'x-portkey-amzn-sagemaker-inference-component',
  SAGEMAKER_SESSION_ID: 'x-portkey-amzn-sagemaker-session-id',
  SAGEMAKER_MODEL_NAME: 'x-portkey-amzn-sagemaker-model-name',
  DEBUG_LOG_SETTING: 'x-portkey-debug',
  VERTEX_AI_PROJECT_ID: 'x-portkey-vertex-project-id',
  VERTEX_AI_REGION: 'x-portkey-vertex-region',
  VERTEX_SERVICE_ACCOUNT_JSON: 'x-portkey-vertex-service-account-json',
  VERTEX_SKIP_PTU_COST_ATTRIBUTION:
    'x-portkey-vertex-skip-ptu-cost-attribution',
  WORKERS_AI_ACCOUNT_ID: 'x-portkey-workers-ai-account-id',
  OPEN_AI_PROJECT: 'x-portkey-openai-project',
  OPEN_AI_ORGANIZATION: 'x-portkey-openai-organization',
  ORACLE_REGION: 'x-portkey-oracle-region',
  ORACLE_VERSION: 'x-portkey-oracle-version',
  ORACLE_COMPARTMENT_ID: 'x-portkey-oracle-compartment-id',
  ORACLE_TENANCY: 'x-portkey-oracle-tenancy',
  ORACLE_PRIVATE_KEY: 'x-portkey-oracle-private-key',
  ORACLE_FINGERPRINT: 'x-portkey-oracle-fingerprint',
  ORACLE_USER: 'x-portkey-oracle-user',
  AUTHORIZATION: 'authorization',
  SPAN_ID: 'x-portkey-span-id',
  SPAN_NAME: 'x-portkey-span-name',
  PARENT_SPAN_ID: 'x-portkey-parent-span-id',
  AZURE_DEPLOYMENT_NAME: 'x-portkey-azure-deployment-name',
  AZURE_REGION: 'x-portkey-azure-region',
  AZURE_ENDPOINT_NAME: 'x-portkey-azure-endpoint-name',
  AZURE_DEPLOYMENT_TYPE: 'x-portkey-azure-deployment-type',
  AZURE_AUTH_MODE: 'x-portkey-azure-auth-mode',
  AZURE_MANAGED_CLIENT_ID: 'x-portkey-azure-managed-client-id',
  AZURE_ENTRA_TENANT_ID: 'x-portkey-azure-entra-tenant-id',
  AZURE_ENTRA_CLIENT_ID: 'x-portkey-azure-entra-client-id',
  AZURE_ENTRA_CLIENT_SECRET: 'x-portkey-azure-entra-client-secret',
  AZURE_FOUNDRY_URL: 'x-portkey-azure-foundry-url',
  CUSTOM_HOST: 'x-portkey-custom-host',
  FORWARD_HEADERS: 'x-portkey-forward-headers',
  IGNORE_SERVICE_LOG: 'x-portkey-ignore-service-log',
  OVERRIDE_SERVICE_LOG_USAGE: 'x-portkey-override-service-log-usage',
  /**
   * @deprecated Used for inter-middleware communication.
   * Prefer using `getContext(c, ContextKeys.DEFAULT_INPUT_GUARDRAILS)` from contextHelpers.ts
   */
  DEFAULT_INPUT_GUARDRAILS: 'x-portkey-default-input-guardrails',
  /**
   * @deprecated Used for inter-middleware communication.
   * Prefer using `getContext(c, ContextKeys.DEFAULT_OUTPUT_GUARDRAILS)` from contextHelpers.ts
   */
  DEFAULT_OUTPUT_GUARDRAILS: 'x-portkey-default-output-guardrails',
  AUDIO_FILE_DURATION: 'x-portkey-audio-file-duration',
  VERTEX_AI_AUTH_TYPE: 'x-portkey-vertex-auth-type',
};

export const PROVIDER_HEADER_KEYS = {
  MODAL_KEY: 'modal-key',
  MODAL_SECRET: 'modal-secret',
};

export const RESPONSE_HEADER_KEYS: Record<string, string> = {
  RETRY_ATTEMPT_COUNT: 'x-portkey-retry-attempt-count',
};

export const CONTENT_TYPES = {
  APPLICATION_JSON: 'application/json',
  MULTIPART_FORM_DATA: 'multipart/form-data',
  EVENT_STREAM: 'text/event-stream',
  GENERIC_AUDIO_PATTERN: 'audio/',
  GENERIC_IMAGE_PATTERN: 'image/',
  APPLICATION_OCTET_STREAM: 'application/octet-stream',
  PLAIN_TEXT: 'text/plain',
  HTML: 'text/html',
  XML: 'application/xml',
  PROTOBUF: 'application/x-protobuf',
};

export const providerAuthHeaderMap = {
  [OPEN_AI]: 'authorization',
  [COHERE]: 'authorization',
  [ANTHROPIC]: HEADER_KEYS.X_API_KEY,
  [ANYSCALE]: 'authorization',
  [AZURE_OPEN_AI]: HEADER_KEYS.API_KEY,
  [TOGETHER_AI]: 'authorization',
};

export const providerAuthHeaderPrefixMap = {
  [OPEN_AI]: 'Bearer ',
  [COHERE]: 'Bearer ',
  [ANTHROPIC]: '',
  [ANYSCALE]: 'Bearer ',
  [AZURE_OPEN_AI]: '',
  [TOGETHER_AI]: '',
  [OLLAMA]: '',
};

export const MODES = {
  PROXY_V2: 'proxy-2', // Latest proxy route: /v1/*
  RUBEUS_V2: 'rubeus-2', // Latest rubeus routes: /v1/chat/completions, /v1/completions, /v1/embeddings and /v1/prompts
  PROXY: 'proxy', // Deprecated proxy route /v1/proxy/*
  RUBEUS: 'rubeus', // Deprecated rubeus routes: /v1/chatComplete, /v1/complete and /v1/embed
  API: 'api', // Deprecated mode that is sent from /v1/prompts/:id/generate calls
  REALTIME: 'realtime',
};

export const CACHE_STATUS = {
  HIT: 'HIT',
  SEMANTIC_HIT: 'SEMANTIC HIT',
  MISS: 'MISS',
  SEMANTIC_MISS: 'SEMANTIC MISS',
  REFRESH: 'REFRESH',
  DISABLED: 'DISABLED',
};

export enum AtomicCounterTypes {
  COST = 'cost',
  TOKENS = 'tokens',
}

export enum AtomicOperations {
  GET = 'GET',
  RESET = 'RESET',
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT',
}

export enum AtomicKeyTypes {
  VIRTUAL_KEY = 'VIRTUAL_KEY',
  API_KEY = 'API_KEY',
  WORKSPACE = 'WORKSPACE',
  INTEGRATION_WORKSPACE = 'INTEGRATION_WORKSPACE',
  USAGE_LIMITS_POLICY = 'USAGE_LIMITS_POLICY',
}

export enum RateLimiterKeyTypes {
  VIRTUAL_KEY = 'VIRTUAL_KEY',
  API_KEY = 'API_KEY',
  WORKSPACE = 'WORKSPACE',
  INTEGRATION_WORKSPACE = 'INTEGRATION_WORKSPACE',
  RATE_LIMIT_POLICY = 'RATE_LIMIT_POLICY',
}

export enum RateLimiterTypes {
  REQUESTS = 'requests',
  TOKENS = 'tokens',
}

export enum EntityStatus {
  ACTIVE = 'active',
  EXHAUSTED = 'exhausted',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
}

export enum CacheKeyTypes {
  VIRTUAL_KEY = 'VKEY',
  API_KEY = 'AKEY',
  API_KEY_ID = 'API_KEY_ID',
  CONFIG = 'CONFIG',
  PROMPT = 'PROMPT',
  PROMPT_PARTIAL = 'PARTIAL',
  ORGANISATION = 'ORG',
  WORKSPACE = 'WS',
  GUARDRAIL = 'GUARDRAIL',
  INTEGRATIONS = 'INTEGRATIONS',
  USAGE_LIMITS_POLICY_EXHAUSTED = 'ULP_EXHAUSTED',
  MCP_SERVER_CONFIG = 'MCP_CONFIG',
}

export const cacheDisabledRoutesRegex = /\/v1\/audio\/.*/;

export const GUARDRAIL_CATEGORIES: Record<string, string> = {
  BASIC: 'BASIC',
  PARTNER: 'PARTNER',
  PRO: 'PRO',
};

export const GUARDRAIL_CATEGORY_FLAG_MAP: Record<string, string> = {
  default: GUARDRAIL_CATEGORIES.BASIC,
  portkey: GUARDRAIL_CATEGORIES.PRO,
  pillar: GUARDRAIL_CATEGORIES.PARTNER,
  patronus: GUARDRAIL_CATEGORIES.PARTNER,
  aporia: GUARDRAIL_CATEGORIES.PARTNER,
  sydelabs: GUARDRAIL_CATEGORIES.PARTNER,
  mistral: GUARDRAIL_CATEGORIES.PARTNER,
  pangea: GUARDRAIL_CATEGORIES.PARTNER,
  promptfoo: GUARDRAIL_CATEGORIES.PARTNER,
  bedrock: GUARDRAIL_CATEGORIES.PARTNER,
  acuvity: GUARDRAIL_CATEGORIES.PARTNER,
  azure: GUARDRAIL_CATEGORIES.PARTNER,
  exa: GUARDRAIL_CATEGORIES.PARTNER,
  lasso: GUARDRAIL_CATEGORIES.PARTNER,
  promptsecurity: GUARDRAIL_CATEGORIES.PARTNER,
  'panw-prisma-airs': GUARDRAIL_CATEGORIES.PARTNER,
  'f5-guardrails': GUARDRAIL_CATEGORIES.PARTNER,
  'crowdstrike-aidr': GUARDRAIL_CATEGORIES.PARTNER,
  zscaler: GUARDRAIL_CATEGORIES.PARTNER,
};

export enum HookTypePreset {
  INPUT_GUARDRAILS = 'input_guardrails',
  INPUT_MUTATORS = 'input_mutators',
  BEFORE_REQUEST_HOOKS = 'before_request_hooks',
  OUTPUT_MUTATORS = 'output_mutators',
  OUTPUT_GUARDRAILS = 'output_guardrails',
  AFTER_REQUEST_HOOKS = 'after_request_hooks',
}

export const hookTypePresets = [
  HookTypePreset.INPUT_GUARDRAILS,
  HookTypePreset.INPUT_MUTATORS,
  HookTypePreset.BEFORE_REQUEST_HOOKS,
  HookTypePreset.OUTPUT_MUTATORS,
  HookTypePreset.OUTPUT_GUARDRAILS,
  HookTypePreset.AFTER_REQUEST_HOOKS,
];
