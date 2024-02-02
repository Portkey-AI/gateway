export const POWERED_BY: string = "portkey";

export const HEADER_KEYS: Record<string, string> = {
  MODE: `x-${POWERED_BY}-mode`,
  RETRIES: `x-${POWERED_BY}-retry-count`,
  PROVIDER: `x-${POWERED_BY}-provider`,
  TRACE_ID: `x-${POWERED_BY}-trace-id`,
  CACHE: `x-${POWERED_BY}-cache`
}

export const RESPONSE_HEADER_KEYS: Record<string, string> = {
  RETRY_ATTEMPT_COUNT: `x-${POWERED_BY}-retry-attempt-count`,
  LAST_USED_OPTION_INDEX: `x-${POWERED_BY}-last-used-option-index`,
  LAST_USED_OPTION_PARAMS: `x-${POWERED_BY}-last-used-option-params`,
  CACHE_STATUS: `x-${POWERED_BY}-cache-status`,
  TRACE_ID: `x-${POWERED_BY}-trace-id`
}

export const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
export const MAX_RETRIES = 5;
export const REQUEST_TIMEOUT_STATUS_CODE = 408;

export const OPEN_AI:string = "openai";
export const COHERE:string = "cohere";
export const AZURE_OPEN_AI:string = "azure-openai";
export const ANTHROPIC:string = "anthropic";
export const ANYSCALE: string = "anyscale";
export const PALM: string = "palm";
export const TOGETHER_AI: string = "together-ai";
export const GOOGLE: string = "google";
export const PERPLEXITY_AI: string = "perplexity-ai";
export const MISTRAL_AI: string = "mistral-ai";
export const DEEPINFRA: string = "deepinfra";

export const providersWithStreamingSupport = [OPEN_AI, AZURE_OPEN_AI, ANTHROPIC, COHERE];
export const allowedProxyProviders = [OPEN_AI, COHERE, AZURE_OPEN_AI, ANTHROPIC];

export const PROXY_REQUEST_PATH_PREFIX:string = "/v1/proxy";

export const CONTENT_TYPES = {
  APPLICATION_JSON: "application/json",
  MULTIPART_FORM_DATA: "multipart/form-data",
  EVENT_STREAM: "text/event-stream",
  AUDIO_MPEG: "audio/mpeg",
  APPLICATION_OCTET_STREAM: "application/octet-stream"
}