import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText, HttpError } from '../utils';
import { VERSION } from './version';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
  if (!parameters.credentials?.domain) {
    return {
      error: `'parameters.credentials.domain' must be set`,
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

  // TODO: Update to v1 once released
  const url = `https://ai-guard.${parameters.credentials.domain}/v1/text/guard`;

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
      'User-Agent': 'portkey-ai-plugin/' + VERSION,
      Authorization: `Bearer ${parameters.credentials.apiKey}`,
    },
  };

  // Avoid sending empty strings
  const recipe = parameters.recipe ? parameters.recipe : undefined;

  const request = {
    text: text,
    recipe: recipe,
    debug: parameters.debug,
    overrides: parameters.overrides,
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
    if (response.status == 'Success') {
      data = response.result;
      const detectors = data.detectors;
      if (
        detectors?.prompt_injection?.detected ||
        detectors?.pii_entity?.detected ||
        detectors?.malicious_entity?.detected ||
        detectors?.custom_entity?.detected ||
        detectors?.secrets_detection?.detected ||
        detectors?.profanity_and_toxicity?.detected
      ) {
        verdict = false;
      }
    } else {
      error = errorToString(response);
    }
  }

  return {
    error, // or error object if an error occurred
    verdict, // or false to indicate if the guardrail passed or failed
    data, // any additional data you want to return
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
