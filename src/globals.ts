export const POWERED_BY: string = "rubeus";

export const HEADER_KEYS: Record<string, string> = {
  MODE: `x-${POWERED_BY}-mode`,
  RETRIES: `x-${POWERED_BY}-retry-count`
}

export const RESPONSE_HEADER_KEYS: Record<string, string> = {
  RETRY_ATTEMPT_COUNT: `x-${POWERED_BY}-retry-attempt-count`,
  LAST_USED_OPTION_INDEX: `x-${POWERED_BY}-last-used-option-index`
}

export const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
export const MAX_RETRIES = 5;

export const OPEN_AI:string = "openai";
export const COHERE:string = "cohere";
export const AZURE_OPEN_AI:string = "azure-openai";
export const ANTHROPIC:string = "anthropic";
export const AI_21:string = "ai21";

export const providersWithStreamingSupport = [OPEN_AI, AZURE_OPEN_AI, ANTHROPIC, COHERE];
export const allowedProxyProviders = [OPEN_AI, COHERE, AZURE_OPEN_AI, ANTHROPIC];

export const PROXY_REQUEST_PATH_PREFIX:string = "/v1/proxy";

export const CONTENT_TYPES = {
  APPLICATION_JSON: "application/json",
  MULTIPART_FORM_DATA: "multipart/form-data",
  EVENT_STREAM: "text/event-stream"
}