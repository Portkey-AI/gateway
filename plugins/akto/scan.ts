import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getCurrentContentPart, HttpError, TimeoutError } from '../utils';

// Constants
const DEFAULT_BASE_URL = 'https://1726615470-guardrails.akto.io';
const API_ENDPOINT = '/api/validate/request';
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MODEL = 'unknown';

interface AktoCredentials {
  apiKey: string;
  baseUrl?: string;
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
  let verdict = true;
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

  const credentials = parameters.credentials as AktoCredentials | undefined;

  // Validate credentials
  if (!credentials?.apiKey) {
    return createErrorResponse('Missing required API key');
  }

  // Extract content
  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    return createErrorResponse('Request or response content is empty');
  }

  // Construct API URL
  const baseUrl = credentials.baseUrl || DEFAULT_BASE_URL;
  const apiUrl = baseUrl.includes(API_ENDPOINT)
    ? baseUrl
    : `${baseUrl}${API_ENDPOINT}`;

  // Extract parameters with defaults
  const timeout = (parameters.timeout as number) || DEFAULT_TIMEOUT;

  // Get model from context with safe fallback
  const model =
    context.request?.json?.model ||
    context.response?.json?.model ||
    DEFAULT_MODEL;

  try {
    // Construct payload as stringified JSON
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
    if (response && response.Allowed === false) {
      verdict = false;
      const blockMessage =
        response.Reason ||
        'Request blocked by Akto guardrails due to policy violation';
      data = {
        ...response,
        blockReason: blockMessage,
      };
    }
  } catch (e) {
    // Determine error type and handle accordingly
    if (e instanceof HttpError) {
      const status = e.response.status;

      // Authentication/Authorization errors should be handled differently
      if (status === 401 || status === 403) {
        error = `Akto authentication failed: ${e.response.body || e.message}`;
        // Still fail open but log the auth issue
      } else if (status === 429) {
        error = 'Akto rate limit exceeded';
      } else if (status >= 500) {
        error = 'Akto service temporarily unavailable';
      } else {
        error = e.response.body || e.message;
      }
    } else if (e instanceof TimeoutError) {
      error = `Akto request timeout after ${timeout}ms`;
    } else {
      error = e instanceof Error ? e.message : 'Unknown error occurred';
    }

    // Fail open on errors to prevent blocking legitimate requests
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
