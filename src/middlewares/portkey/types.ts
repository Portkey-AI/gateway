import {
  AtomicOperations,
  AtomicKeyTypes,
  AtomicCounterTypes,
  EntityStatus,
  RateLimiterTypes,
} from './globals';

export interface WinkyLogObject {
  id: string;
  traceId: string;
  internalTraceId: string;
  requestMethod: string;
  requestURL: string;
  rubeusURL: string;
  requestHeaders: Record<string, any>;
  requestBody: string;
  requestBodyParams: Record<string, any>;
  finalUntransformedRequest?: Record<string, any>;
  transformedRequest?: Record<string, any>;
  originalResponse?: Record<string, any>;
  createdAt: Date;
  responseHeaders: Record<string, any> | null;
  responseBody: string | null;
  responseStatus: number;
  responseTime: number;
  cacheKey: string;
  providerOptions: Record<string, any>;
  debugLogSetting: boolean;
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

export interface LogObjectRequest {
  url: string;
  method: string;
  headers: Record<string, any>;
  body: any;
  status: number;
  provider?: string;
}

export interface LogObjectResponse {
  status: number;
  headers: Record<string, any>;
  body: any;
  response_time: number;
  streamingMode: boolean;
}

export interface LogObjectMetadata extends Record<string, any> {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  spanName?: string;
}

export interface LogObject {
  request: LogObjectRequest;
  response: LogObjectResponse;
  metadata: LogObjectMetadata;
  createdAt: string;
  organisationDetails: OrganisationDetails; // Needed for auth in logging
}

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
  log?: LogObject;
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

interface OpenAIChoiceMessage {
  role: string;
  content: string;
  content_blocks?: OpenAIChoiceMessageContentType[];
  tool_calls?: any;
}

/**
 * A message content type.
 * @interface
 */
export interface OpenAIChoiceMessageContentType {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
  data?: string;
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
  id: string;
  object: string;
  created: string;
  choices: OpenAIChoice[];
  model: string;
  usage: OpenAIUsage;
  citations?: Record<string, any>;
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

interface OrganisationDefaults {
  input_guardrails?: string[];
  output_guardrails?: string[];
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

interface ApiKeyDetails {
  id: string;
  expiresAt?: string;
  scopes: string[];
  rateLimits?: RateLimit[];
  defaults: ApiKeyDefaults;
  usageLimits: UsageLimits[];
  systemDefaults?: {
    user_name: string;
    user_key_metadata_override: boolean;
  };
}

export interface WorkspaceDetails {
  id: string;
  slug: string;
  defaults: ApiKeyDefaults;
  usage_limits: UsageLimits[];
  rate_limits: RateLimit[];
  status: EntityStatus;
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
    scopes: string[];
    rateLimits?: RateLimit[];
    defaults: ApiKeyDefaults;
    usageLimits: UsageLimits[];
    status: EntityStatus;
    expiresAt?: string;
    systemDefaults?: {
      user_name?: string;
      user_key_metadata_override?: boolean;
    };
  };
  organisationDefaults: OrganisationDefaults;
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

export interface BaseGuardrail {
  slug: string;
  organisationId: string;
  workspaceId: string | null;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent: string;
  };
  groundingSupports?: Array<{
    segment: {
      startIndex: number;
      endIndex: number;
      text: string;
    };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }>;
  retrievalMetadata?: {
    webDynamicRetrievalScore: number;
  };
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

export type AtomicCounterResponseType = {
  value: number;
  success: boolean;
  message?: string;
  type?: AtomicKeyTypes;
  key?: string;
};
