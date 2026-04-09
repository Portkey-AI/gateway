import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText, HttpError } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  if (!parameters.credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }

  const baseUrl =
    parameters.credentials.baseUrl || 'https://api.promptguard.co/api/v1';
  const url = `${baseUrl}/security/scan`;

  const text = getText(context, eventType);
  if (!text) {
    return {
      error: 'request or response text is empty',
      verdict: true,
      data,
    };
  }

  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': parameters.credentials.apiKey,
    },
  };

  const scanType = eventType === 'beforeRequestHook' ? 'prompt' : 'response';

  const request = {
    content: text,
    type: scanType,
  };

  let response;
  try {
    response = await post(url, request, requestOptions, parameters.timeout);
  } catch (e) {
    if (e instanceof HttpError) {
      error = `${e.message}. body: ${e.response.body}`;
    } else {
      error = e as Error;
    }
  }

  if (response) {
    data = response;
    if (response.blocked) {
      verdict = false;
    }
  }

  return { error, verdict, data };
};
