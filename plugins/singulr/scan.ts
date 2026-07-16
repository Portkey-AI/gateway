import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { post, HttpError, TimeoutError } from '../utils';

const SINGULR_SCAN_ENDPOINT = '/api/v1/ai-gateway/portkey';
const SINGULR_DEFAULT_BASE_URL = 'https://api.singulr.ai';
const DEFAULT_TIMEOUT = 30000;

interface SingulrCredentials {
  SingulrApiKey: string;
  SingulrGuardrailId?: string;
  SingulrApplicationId?: string;
  SingulrBaseUrl?: string;
}

interface SingulrScanRequest {
  provider?: string;
  guard_input?: any;
  guardrail_id?: string;
  enforcement_id?: string;
  eventType: HookEventType;
  metadata?: {
    user_id?: string;
    model?: string;
    extra_info?: Record<string, unknown>;
  };
}

interface SingulrScanResponse {
  should_block: boolean;
  blocking_due_to: string;
}

const buildSingulrScanRequestBody = (
  context: PluginContext,
  eventType: HookEventType,
  credentials: SingulrCredentials
): SingulrScanRequest => {
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target].json;

  const contextMetadata = context.metadata ?? {};
  const userId = contextMetadata._user ?? contextMetadata.user_id;
  const userName = contextMetadata._user_name ?? contextMetadata.user_name;
  const model = context.request?.json?.model;

  const requestBody: SingulrScanRequest = {
    provider: context.provider,
    guard_input: json,
    eventType,
    ...(credentials.SingulrGuardrailId && {
      guardrail_id: credentials.SingulrGuardrailId,
    }),
    ...(credentials.SingulrApplicationId && {
      enforcement_id: credentials.SingulrApplicationId,
    }),
  };

  if (userId || model || userName) {
    requestBody.metadata = {
      ...(userId && { user_id: userId }),
      ...(model && { model }),
      ...(userName && { extra_info: { user_name: userName } }),
    };
  }

  return requestBody;
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData: Record<string, unknown> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  const credentials = parameters.credentials as unknown as
    | SingulrCredentials
    | undefined;

  if (!credentials?.SingulrApiKey) {
    return {
      error: 'Missing required credentials: SingulrApiKey',
      verdict,
      data,
      transformedData,
      transformed,
    };
  }
  if (!credentials.SingulrGuardrailId && !credentials.SingulrApplicationId) {
    return {
      error:
        'Missing required credentials: SingulrGuardrailId or SingulrApplicationId',
      verdict,
      data,
      transformedData,
      transformed,
    };
  }

  const apiUrl = credentials.SingulrBaseUrl
    ? credentials.SingulrBaseUrl.replace(/\/$/, '') + SINGULR_SCAN_ENDPOINT
    : SINGULR_DEFAULT_BASE_URL + SINGULR_SCAN_ENDPOINT;

  if (!context?.request?.json && !context?.response?.json) {
    return {
      error: null,
      verdict: true,
      data: { explanation: 'No content to scan, passing through' },
      transformedData,
      transformed,
    };
  }

  const timeout = (parameters.timeout as number) || DEFAULT_TIMEOUT;

  try {
    const requestBody = buildSingulrScanRequestBody(
      context,
      eventType,
      credentials
    );

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-Singulr-Gateway-Token': credentials.SingulrApiKey,
        ...(credentials.SingulrGuardrailId && {
          'X-Singulr-Guardrail-Id': credentials.SingulrGuardrailId,
        }),
        ...(credentials.SingulrApplicationId && {
          'X-Singulr-Enforcement-Entity-Id': credentials.SingulrApplicationId,
        }),
      },
    };

    const response = await post<SingulrScanResponse>(
      apiUrl,
      requestBody,
      requestOptions,
      timeout
    );

    if (response.should_block) {
      verdict = false;
      data = {
        explanation: `Blocked by Singulr guardrail: ${response.blocking_due_to}`,
      };
    } else {
      verdict = true;
      data = { explanation: 'Allowed by Singulr guardrail' };
    }
  } catch (e) {
    if (e instanceof HttpError) {
      const status = e.response.status;
      error =
        status === 401 || status === 403
          ? `Authentication failed (${status}): Please check your API key`
          : status >= 500
            ? `Service unavailable (${status}): Singulr service might be down`
            : `HTTP ${status} error: ${e.response.body}`;
    } else if (e instanceof TimeoutError) {
      error = `Request timeout after ${timeout}ms: Singulr scan took too long`;
    } else {
      error =
        e instanceof Error
          ? e.message
          : 'Unknown error occurred during Singulr scan';
    }
    verdict = true;
    data = null;
  }
  return { error, verdict, data, transformedData, transformed };
};
