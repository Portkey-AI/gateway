import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, HttpError, TimeoutError } from '../utils';

const SINGULR_SCAN_ENDPOINT = '/api/v1/ai-gateway/portkey';
const DEFAULT_TIMEOUT = 5000;

interface SingulrCredentials {
  singulrApiKey: string;
  singulrBaseUrl: string;
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
  target: 'request' | 'response',
  guardrailId: string,
  applicationId: string
): SingulrScanRequest => {
  const json = context[target].json;

  const contextMetadata = context.metadata ?? {};
  const userId = contextMetadata._user ?? contextMetadata.user_id;
  const userName = contextMetadata._user_name ?? contextMetadata.user_name;
  const model = context.request?.json?.model;

  const requestBody: SingulrScanRequest = {
    provider: context.provider,
    guard_input: json,
    eventType,
    guardrail_id: guardrailId,
    enforcement_id: applicationId,
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

  if (!credentials?.singulrApiKey || !credentials?.singulrBaseUrl) {
    return {
      error:
        'Missing required credentials: singulrApiKey and singulrBaseUrl are both required',
      verdict,
      data,
      transformedData,
      transformed,
    };
  }
  const guardrailId = parameters.guardrailId as string | undefined;
  const applicationId = parameters.applicationId as string | undefined;

  if (!guardrailId || !applicationId) {
    return {
      error:
        'Missing required parameters: guardrailId and applicationId are both required',
      verdict,
      data,
      transformedData,
      transformed,
    };
  }

  const apiUrl =
    credentials.singulrBaseUrl.replace(/\/$/, '') + SINGULR_SCAN_ENDPOINT;

  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  if (!context?.[target]?.json) {
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
      target,
      guardrailId,
      applicationId
    );

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-Singulr-Gateway-Token': credentials.singulrApiKey,
        'X-Singulr-Guardrail-Id': guardrailId,
        'X-Singulr-Enforcement-Entity-Id': applicationId,
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
