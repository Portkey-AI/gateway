import { ContentType } from '../../types/requestBody';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  AtomicOperations,
  EntityStatus,
  RateLimiterTypes,
} from './globals';
import { GroundingMetadata } from '../../providers/types';

export interface WinkyLogObject {
  id: string;
  traceId: string;
  internalTraceId: string;
  requestMethod: string;
  requestURL: string;
  rubeusURL: string;
  requestHeaders: Record<string, any>;
  requestBody: Record<string, any>;
  requestBodyParams: Record<string, any>;
  finalUntransformedRequest?: Record<string, any>;
  transformedRequest?: Record<string, any>;
  originalResponse?: Record<string, any>;
  createdAt: Date;
  upstreamResponseTime?: number;
  responseHeaders: Record<string, any> | null;
  responseBody: Record<string, any> | null;
  responseStatus: number;
  responseTime: number;
  cacheKey: string;
  providerOptions: Record<string, any>;
  debugLogSetting: boolean;
  gatewayVersion: string;
  requestParsingTime: number;
  preProcessingTime: number;
  cacheExecutionTime: number;
  responseParsingTime: number;
  timeToLastToken: number;
  gatewayProcessingTime: number;
  config: {
    organisationConfig: Record<string, any> | null;
    organisationDetails: OrganisationDetails;
    cacheStatus: string;
    cacheType: string | null;
    retryCount: number;
    portkeyHeaders: Record<string, any> | null;
    proxyMode: string;
    streamingMode: boolean;
    provider: string;
    requestParams: Record<string, any>;
    lastUsedOptionIndex: number;
    internalTraceId: string;
    cacheMaxAge: number | null;
  };
}

interface OpenAIChoiceMessage {
  role: string;
  content: string;
  tool_calls?: any;
  content_blocks?: ContentType[];
  annotations?: any;
}

interface OpenAIChoice {
  index: string;
  finish_reason: string;
  message?: OpenAIChoiceMessage;
  text?: string;
  logprobs?: any;
  groundingMetadata?: GroundingMetadata;
}

interface AnthropicPromptUsageTokens {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface OpenAIUsage extends AnthropicPromptUsageTokens {
  completion_tokens: number;
  prompt_tokens?: number;
  total_tokens?: number;
  num_search_queries?: number;
  completion_tokens_details?: {
    accepted_prediction_tokens?: number;
    audio_tokens?: number;
    reasoning_tokens?: number;
    rejected_prediction_tokens?: number;
  };
  prompt_tokens_details?: {
    audio_tokens?: number;
    cached_tokens?: number;
  };
}

export interface OpenAIStreamResponse {
  hook_results?: HookResult;
  id: string;
  object: string;
  created: string;
  choices: OpenAIChoice[];
  model: string;
  usage: OpenAIUsage;
  citations?: string[];
  groundingMetadata?: GroundingMetadata;
  service_tier?: string | null;
  system_fingerprint?: string | null;
}

interface CohereGeneration {
  id: string;
  text: string;
  finish_reason: string;
}

export interface CohereStreamResponse {
  id: string;
  generations: CohereGeneration[];
  prompt: string;
}

export interface ParsedChunk {
  is_finished: boolean;
  finish_reason: string;
  response?: {
    id: string;
    generations: CohereGeneration[];
    prompt: string;
  };
  text?: string;
}

export interface AnthropicCompleteStreamResponse {
  completion: string;
  stop_reason: string;
  model: string;
  truncated?: boolean;
  stop: null | string;
  log_id: string;
  exception?: any | null;
}

export interface AnthropicMessagesStreamResponse {
  id: string;
  type: string;
  role: string;
  content: {
    type: string;
    text: string;
  }[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
}

interface GoogleGenerateFunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface GoogleGenerateContentResponse {
  candidates: {
    content: {
      parts: {
        text?: string;
        functionCall?: GoogleGenerateFunctionCall;
      }[];
      role: string;
    };
    finishReason: string;
    index: 0;
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  }[];
  promptFeedback: {
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  };
}

export interface TogetherAIResponse {
  id: string;
  choices: {
    text?: string;
    message?: {
      role: string;
      content: string;
    };
  }[];
  created: string;
  model: string;
  object: string;
}

export interface TogetherInferenceResponse {
  status: string;
  output: {
    choices: {
      text: string;
    }[];
    request_id: string;
  };
}

export interface OllamaCompleteResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context: number[];
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface OllamaCompleteStreamReponse {
  model: string;
  created_at: number;
  response: string;
  done: boolean;
  context: number[];
}

export interface OllamaChatCompleteResponse {
  model: string;
  created_at: number;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface OllamaChatCompleteStreamResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count?: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export type AtomicCounterRequestType = {
  operation: AtomicOperations;
  type: AtomicKeyTypes;
  organisationId: string;
  key: string;
  amount: number;
  metadata?: Record<string, string>;
  usageLimitId?: string;
  counterType?: AtomicCounterTypes;
  policyId?: string;
  valueKey?: string;
};

export type AtomicCounterResponseType = {
  value: number;
  success: boolean;
  message?: string;
  type?: AtomicKeyTypes;
  key?: string;
};

export interface RateLimit {
  type: RateLimiterTypes;
  unit: string;
  value: number;
}

interface ApiKeyDefaults {
  config_slug?: string;
  config_id?: string;
  metadata?: Record<string, string>;
  input_guardrails?: OrganisationDefaults['input_guardrails'];
  output_guardrails?: OrganisationDefaults['output_guardrails'];
  allow_config_override?: boolean;
}

export interface WorkspaceDetails {
  id: string;
  slug: string;
  name?: string;
  defaults: ApiKeyDefaults;
  usage_limits: UsageLimits[];
  rate_limits: RateLimit[];
  status: EntityStatus;
  policies: {
    usage_limits: UsageLimitsPolicy[];
    rate_limits: RateLimitPolicy[];
  };
}

interface OrganisationDefaults {
  input_guardrails?: string[];
  output_guardrails?: string[];
}

export interface VirtualKeyDetails {
  id: string;
  slug: string;
  usage_limits: UsageLimits[];
  rate_limits: RateLimit[];
  status: EntityStatus;
  workspace_id: string;
  organisation_id: string;
  expires_at: string;
}

export interface IntegrationDetails {
  id: string;
  slug: string;
  usage_limits: UsageLimits[];
  rate_limits: RateLimit[];
  status: EntityStatus;
  allow_all_models: boolean;
  models: {
    slug: string;
    status: EntityStatus.ACTIVE | EntityStatus.ARCHIVED;
    pricing_config: Record<string, any>;
  }[];
}

export interface UsageLimits {
  id?: string;
  type: AtomicCounterTypes;
  credit_limit: number | null;
  alert_threshold: number | null;
  is_threshold_alerts_sent: boolean | null;
  is_exhausted_alerts_sent: boolean | null;
  periodic_reset: string | null;
  current_usage: number | null;
  last_reset_at: string | null;
  metadata: Record<string, string>;
  status: EntityStatus;
}

export type PolicyConditionKey =
  | 'api_key'
  | 'organisation_id'
  | 'workspace_id'
  | 'virtual_key'
  | 'provider'
  | 'config'
  | 'prompt'
  | 'model';

export interface UsageLimitsPolicyCondition {
  key: PolicyConditionKey;
  value?: string | string[];
  excludes?: string | string[];
}

export interface UsageLimitsPolicyGroupBy {
  key: PolicyConditionKey;
}

export interface UsageLimitsPolicyValueStatus {
  status: EntityStatus; // ACTIVE, EXHAUSTED, etc.
  current_usage: number;
  last_reset_at: string | null;
}

export interface UsageLimitsPolicy {
  id: string;
  workspace_id: string;
  organisation_id: string;
  conditions: UsageLimitsPolicyCondition[]; // For matching/filtering whether policy applies
  group_by: UsageLimitsPolicyGroupBy[]; // For bucketing/creating unique usage limit keys
  credit_limit: number;
  type: 'cost' | 'tokens';
  periodic_reset: 'weekly' | 'monthly' | 'yearly' | null;
  status: EntityStatus; // Overall policy status
}

export interface UsageLimitsPolicyMatchResult {
  policy: UsageLimitsPolicy;
  valueKey: string; // The specific combination key, e.g., "apikey123:user456"
  isExhausted: boolean;
}

export interface RateLimitPolicyCondition {
  key: PolicyConditionKey;
  value?: string | string[]; // "*" for wildcard, single value, or array of values (OR logic)
  excludes?: string | string[]; // Values to exclude (NOT logic)
}

export interface RateLimitPolicyGroupBy {
  key: PolicyConditionKey;
}

export interface RateLimitPolicy {
  id: string;
  workspace_id: string;
  conditions: RateLimitPolicyCondition[]; // For matching/filtering whether policy applies
  group_by: RateLimitPolicyGroupBy[]; // For bucketing/creating unique rate limit keys
  value: number; // Number of requests or tokens allowed
  type: 'requests' | 'tokens'; // What to rate limit
  unit: 'rpm' | 'rph' | 'rpd';
  status: EntityStatus; // Overall policy status
}

export interface RateLimitPolicyMatchResult {
  policy: RateLimitPolicy;
  valueKey: string; // The specific combination key, e.g., "apikey123:user456"
  rateLimiterKey: string; // Redis key for the rate limiter
}

export interface PolicyContext {
  apiKeyId: string;
  metadata: Record<string, string>;
  organisationId: string;
  workspaceId: string;
  virtualKeyId?: string;
  virtualKeySlug?: string;
  providerSlug?: string; // Provider slug (e.g., "openai", "anthropic")
  configId?: string;
  configSlug?: string;
  promptId?: string;
  promptSlug?: string;
  model?: string;
}

export interface OrganisationDetails {
  id: string;
  ownerId?: string;
  name?: string;
  settings: Record<string, any>;
  isFirstGenerationDone: boolean;
  enterpriseSettings?: Record<string, any>;
  workspaceDetails: WorkspaceDetails;
  scopes: string[];
  rateLimits?: RateLimit[];
  defaults: ApiKeyDefaults;
  usageLimits: UsageLimits[];
  status: EntityStatus;
  apiKeyDetails: {
    id: string;
    key: string;
    isJwt: boolean;
    scopes: string[];
    rateLimits?: RateLimit[];
    defaults: ApiKeyDefaults;
    usageLimits: UsageLimits[];
    status: EntityStatus;
    expiresAt?: string;
    userId?: string;
    systemDefaults?: {
      user_name?: string;
      user_key_metadata_override?: boolean;
    };
  };
  organisationDefaults: OrganisationDefaults;
}

export interface BaseGuardrail {
  slug: string;
  organisationId: string;
  workspaceId: string | null;
}

// Define base analytics fields that are common to both types
type BaseAnalyticsFields = {
  id: string;
  organisation_id: string;
  organisation_name: string;
  user_id: string;
  prompt_id: string;
  prompt_version_id: string;
  config_id: string;
  created_at: string;
  is_success: boolean;
  ai_org: string;
  ai_org_auth_hash: string;
  ai_model: string;
  req_units: number;
  res_units: number;
  total_units: number;
  cost: number;
  cost_currency: string;
  request_url: string;
  request_method: string;
  response_status_code: number;
  response_time: number;
  is_proxy_call: boolean;
  cache_status: string;
  cache_type: string;
  stream_mode: number;
  retry_success_count: number;
  _environment: string;
  _user: string;
  _organisation: string;
  _prompt: string;
  trace_id: string;
  span_id: string;
  span_name: string;
  parent_span_id: string;
  extra_key: string;
  extra_value: string;
  mode: string;
  virtual_key: string;
  source: string;
  runtime: string;
  runtime_version: string;
  sdk_version: string;
  config: string;
  internal_trace_id: string;
  last_used_option_index: number;
  config_version_id: string;
  prompt_slug: string;
  workspace_slug: string;
  log_store_file_path_format: string;
  'metadata.key': Array<string | null>;
  'metadata.value': Array<string | null>;
  api_key_id: string;
  request_parsing_time: number;
  pre_processing_time: number;
  cache_processing_time: number;
  response_parsing_time: number;
  gateway_processing_time: number;
  upstream_response_time: number;
  ttlt: number;
  gateway_version: string;
};

// Helper type for wrapping values in AnalyticsDetails
type WrappedAnalyticsDetails<T extends BaseAnalyticsFields> = {
  [K in keyof T]: AnalyticsDetails<T[K]>;
};

export type AnalyticsDetails<T> = {
  type: 'string' | 'int' | 'array' | 'float' | 'number';
  value: T | null;
  isNullable: boolean;
};

// Define the two main types using the base fields
export type AnalyticsLogObjectV2 = BaseAnalyticsFields;
export type AnalyticsLogObject = WrappedAnalyticsDetails<BaseAnalyticsFields>;

export interface HookFeedbackMetadata extends Record<string, string> {
  successfulChecks: string;
  failedChecks: string;
  erroredChecks: string;
}

export interface HookFeedback {
  value: number;
  weight: number;
  metadata: HookFeedbackMetadata;
}

export interface CheckResult {
  id: string;
  verdict: boolean;
  error?: {
    name: string;
    message: string;
  } | null;
  data: null | Record<string, any>;
}

export interface HookResult {
  verdict: boolean;
  id: string;
  checks: CheckResult[];
  feedback: HookFeedback;
  deny: boolean;
  async: boolean;
}

export interface HookResultWithLogDetails extends HookResult {
  event_type: 'beforeRequestHook' | 'afterRequestHook';
  guardrail_version_id: string;
}

export interface HookResultLogObject {
  generation_id: string;
  trace_id: string;
  internal_trace_id: string;
  organisation_id: string;
  workspace_slug: string;
  results: HookResultWithLogDetails[];
  organisation_details: OrganisationDetails;
}

export type AnalyticsOptions = {
  table: string;
  server?: string;
  database?: string;
};

export type LogOptions = {
  filePath: string;
  mongoCollectionName?: string;
  organisationId: string;
  bucket?: string;
  region?: string;
};

export type LogStoreApmOptions = {
  logId: string;
  type: 'generations' | 'generation_hooks' | 'log-replica-sync'; // This is just used to identify apm errors
  organisationId: string;
};

export type HookResultsLogDetail<T> = {
  type: 'string' | 'int' | 'array' | 'float' | 'number';
  value: T;
  isNullable: boolean;
};

export type HookResultsBaseLogObject = {
  organisation_id: HookResultsLogDetail<string>;
  workspace_slug: HookResultsLogDetail<string>;
  generation_id: HookResultsLogDetail<string>;
  trace_id: HookResultsLogDetail<string>;
  internal_trace_id: HookResultsLogDetail<string>;
  log_store_file_path_format: HookResultsLogDetail<string>;
};

export type HookResultsLogObject = HookResultsBaseLogObject & {
  id: HookResultsLogDetail<string>;
  hook_id: HookResultsLogDetail<string>;
  guardrail_version_id: HookResultsLogDetail<string>;
  hook_event_type: HookResultsLogDetail<string>;
  hook_category: HookResultsLogDetail<string>;
  execution_time: HookResultsLogDetail<number>;
  created_at: HookResultsLogDetail<string>;
  total_checks_passed: HookResultsLogDetail<number>;
  total_checks_failed: HookResultsLogDetail<number>;
  total_checks_errored: HookResultsLogDetail<number>;
  verdict: HookResultsLogDetail<boolean>;
  async: HookResultsLogDetail<boolean>;
  deny: HookResultsLogDetail<boolean>;
  is_raw_log_available: HookResultsLogDetail<boolean>;
  // Final clickhouse log object needs all nested columns to be string.
  // So it is not possible to mention the actual types currently
  'checks.check_id': HookResultsLogDetail<Array<string>>; // string[]
  'checks.execution_time': HookResultsLogDetail<Array<string>>; // number[]
  'checks.created_at': HookResultsLogDetail<Array<string>>; // string[]
  'checks.verdict': HookResultsLogDetail<Array<string>>; // boolean[]
  'checks.error': HookResultsLogDetail<Array<boolean>>; // boolean[]
  'checks.parameters': HookResultsLogDetail<Array<any>>; // any[]
};

export type HookResultsRawLogObject = {
  _id: string;
  hook_id: string;
  organisation_id: string;
  created_at: string;
  checks: {
    check_id: string;
    data: any;
    error: any;
  }[];
};

// Re-export context helpers for convenient access
export {
  ContextKeys,
  LegacyContextKeys,
  getContext,
  setContext,
  getOrParseFromHeader,
  hasContext,
} from './contextHelpers';
export type { PortkeyContextValues } from './contextHelpers';
