import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post } from '../utils';
import { VERSION } from './version';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  if (!parameters.credentials?.baseUrl) {
    return {
      error: `'parameters.credentials.baseUrl' must be set`,
      verdict: true,
      data,
    };
  }

  if (!parameters.credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }

  const url = `${parameters.credentials.baseUrl}/v1/guard_chat_completions`;
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target].json;
  const aidrEventType = target === 'request' ? 'input' : 'output';

  const requestBody: object = {
    guard_input: json,
    event_type: aidrEventType,
    app_id: 'Portkey AI Gateway',
    // TODO: Add as much other metadata as we have
  };

  const requestOptions: object = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `portkey-ai-plugin/${VERSION}`,
      Authorization: `Bearer ${parameters.credentials.apiKey}`,
    },
  };

  try {
    const response = await post(
      url,
      requestBody,
      requestOptions,
      parameters.timeout
    );

    // Check if response has expected structure
    if (response.status !== 'Success') {
      error = errorToString(response);
      return {
        error,
        verdict,
        data,
      };
    }

    const result = response.result;
    if (!result) {
      return {
        error: `Missing result from response body`,
        verdict,
        data,
      };
    }

    const redactParam = parameters.redact as boolean;

    // Handle blocked requests - always block regardless of redact parameter
    if (result.blocked) {
      data = {
        explanation: `Blocked by AIDR Policy '${result.policy}'`,
      };
      return {
        error,
        verdict: false,
        data,
      };
    }

    // Handle transformed requests - apply redaction only if parameter is enabled
    if (result.transformed) {
      if (!redactParam) {
        // Transformation available but user chose not to apply it
        data = {
          explanation: `Sensitive content detected by AIDR Policy '${result.policy}', but redaction is disabled`,
        };
        return {
          error,
          verdict: false,
          data,
        };
      }

      // Apply transformation
      data = {
        explanation: `Content redacted by AIDR policy '${result.policy}'`,
      };

      const transformedData: Record<string, any> = {
        request: {
          json: null,
        },
        response: {
          json: null,
        },
      };

      const redactedJson = result.guard_output;
      transformedData[target].json = redactedJson;

      return {
        error,
        verdict: true,
        data,
        transformedData,
        transformed: true,
      };
    }

    // No issues detected - allow request
    data = {
      explanation: `Allowed by AIDR Policy '${result.policy}'`,
    };
    return {
      error,
      verdict,
      data,
    };
  } catch (e) {
    return {
      error: e,
      verdict,
      data,
    };
  }
};

function errorToString(response: any): string {
  let ret = `Summary: ${response.summary}\n`;
  ret += `status: ${response.status}\n`;
  ret += `request_id: ${response.request_id}\n`;
  ret += `request_time: ${response.request_time}\n`;
  ret += `response_time: ${response.response_time}\n`;
  (response.result?.errors || []).forEach((ef: any) => {
    ret += `\t${ef.source} ${ef.code}: ${ef.detail}\n`;
  });
  return ret;
}
