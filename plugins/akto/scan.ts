import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getCurrentContentPart, HttpError, TimeoutError } from '../utils';

// Constants
const API_ENDPOINT = '/api/validate/request';
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MODEL = 'unknown';

interface AktoCredentials {
  apiDomain: string;
  apiKey: string;
  baseUrl?: string; // Optional baseUrl to override apiDomain + API_ENDPOINT construction
}

interface AktoScanRequest {
  payload: string; // Stringified JSON containing prompt and model
}

interface AktoPayload {
  prompt: string;
  model: string;
}

interface AktoScanResponse {
  Allowed: boolean;
  Modified: boolean;
  ModifiedPayload: string;
  Reason: string;
  Metadata: {
    model?: string;
    prompt?: string;
    [key: string]: unknown;
  };
}

// Helper to create consistent error response
const createErrorResponse = (
  error: string | Error,
  verdict: boolean = true
) => ({
  error: typeof error === 'string' ? error : error.message,
  verdict,
  data: null,
  transformedData: {
    request: { json: null },
    response: { json: null },
  },
  transformed: false,
});

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true; // Default to allow (fail open)
  let data = null;
  const transformedData: Record<string, unknown> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  const credentials = parameters.credentials as unknown as AktoCredentials | undefined;

  // Validate credentials
  // We require either apiDomain or baseUrl, and apiKey
  if (!credentials?.apiKey) {
    return createErrorResponse('Missing required credentials: apiKey');
  }

  // Determine API URL
  let apiUrl: string;
  if (credentials.baseUrl) {
    apiUrl = credentials.baseUrl;
  } else if (credentials.apiDomain) {
    // If apiDomain is provided, construct the URL
    // Handle cases where apiDomain might include protocol or trailing slash
    let domain = credentials.apiDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    apiUrl = `https://${domain}${API_ENDPOINT}`;
  } else {
    return createErrorResponse('Missing required credentials: apiDomain or baseUrl');
  }

  // Extract content
  // We use getCurrentContentPart helper to handle both request and response hooks
  const { content } = getCurrentContentPart(context, eventType);

  if (!content) {
    return createErrorResponse('Request or response content is empty');
  }

  // Extract parameters with defaults
  const timeout = (parameters.timeout as number) || DEFAULT_TIMEOUT;

  // Get model from context with safe fallback
  // This handles various locations where model might be stored
  const model =
    context.request?.json?.model ||
    context.response?.json?.model ||
    DEFAULT_MODEL;

  try {
    // Construct payload as stringified JSON
    // We ensure prompt is always a string
    const payloadData: AktoPayload = {
      prompt: typeof content === 'string' ? content : JSON.stringify(content),
      model: model,
    };

    const requestBody: AktoScanRequest = {
      payload: JSON.stringify(payloadData),
    };

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
        'User-Agent': 'portkey-ai-gateway/1.0.0',
      },
    };

    const response = await post<AktoScanResponse>(
      apiUrl,
      requestBody,
      requestOptions,
      timeout
    );

    data = response;

    // Check if request is blocked by Akto
    // Explicit check for Allowed === false to be safe
    if (response && response.Allowed === false) {
      verdict = false;
    } else {
      verdict = true;
    }
  } catch (e) {
    // Determine error type and handle accordingly
    if (e instanceof HttpError) {
      const status = e.response.status;
      if (status === 401 || status === 403) {
        error = `Authentication failed (${status}): Please check your API key`;
      } else if (status === 429) {
        error = 'Rate limit exceeded: Please try again later';
      } else if (status >= 500) {
        error = `Service unavailable (${status}): Akto service might be down`;
      } else {
        error = `HTTP ${status} error: ${e.response.statusText}`;
      }
    } else if (e instanceof TimeoutError) {
      error = `Request timeout after ${timeout}ms: Akto scan took too long`;
    } else {
      error = e instanceof Error ? e.message : 'Unknown error occurred during Akto scan';
    }

    // Fail open on errors to prevent blocking legitimate requests due to plugin failure
    // This is a critical design decision for production reliability
    verdict = true;
    data = null;
  }

  return {
    error,
    verdict,
    data,
    transformedData,
    transformed,
  };
};
