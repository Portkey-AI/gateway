import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText } from '../utils';

const API_URL =
  'https://services.walled.ai/v1/guardrail/moderate';

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

  const text = getText(context, eventType);
  if (!text) {
    return {
      error: 'request or response text is empty',
      verdict: true,
      data,
    };
  }

  // Prepare request body
  const requestBody = {
    text: text,
    text_type: parameters.text_type || 'prompt',
    generic_safety_check: parameters.generic_safety_check ?? true,
    greetings_list: parameters.greetings_list || ['generalgreetings'],
  };

  // Prepare headers
  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${parameters.credentials.apiKey}`, // Uncomment if API key is required
    },
  };

  try {
    const response = await post(API_URL, requestBody, requestOptions, parameters.timeout);
    data = response.data;
    if (
        data.safety[0]?.isSafe==false
    ) {
      verdict = false;
    }
  } catch (e) {
    console.log(e)
    error = e instanceof Error ? e.message : String(e);
    verdict = true;
    data = null;
  }
  return {
    error,
    verdict,
    data,
  };
};
