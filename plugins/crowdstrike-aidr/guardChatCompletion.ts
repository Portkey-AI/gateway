import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, HttpError } from '../utils';
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

  let response;
  try {
    response = await post(url, requestBody, requestOptions, parameters.timeout);
  } catch (e) {
    if (e instanceof HttpError) {
      error = `${e.message}. body: ${e.response.body}`;
    } else {
      error = e as Error;
    }
  }

  if (!response) {
    return {
      error,
      verdict,
      data,
    };
  }

  if (response.status != 'Success') {
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
      error: `Missing result from response body: ${response}`,
      verdict,
      data,
    };
  }

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

  if (!result.transformed) {
    // Not blocked, not transformed, nothing else to do
    data = {
      explanation: `Allowed by AIDR Policy '${result.policy}'`,
    };
    return {
      error,
      verdict,
      data,
    };
  }

  data = {
    explanation: `Allowed by AIDR policy '${result.policy}', but requires transformations`,
  };

  let transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };

  const redactedJson = result.guard_output;
  transformedData[target].json = redactedJson;

  // Apply transformations
  return {
    error,
    verdict,
    data,
    transformedData,
    transformed: true,
  };
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
