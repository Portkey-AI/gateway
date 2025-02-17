import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post } from '../utils';

function parseHeaders(headers: unknown): Record<string, string> {
  try {
    if (typeof headers === 'object' && headers !== null) {
      return headers as Record<string, string>;
    }
    if (typeof headers === 'string') {
      try {
        const parsed = JSON.parse(headers as string);
        return parsed;
      } catch {
        throw new Error('Invalid headers format');
      }
    }
    return {};
  } catch (error: any) {
    throw error;
  }
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: {
      json: null,
      text: null,
    },
    response: {
      json: null,
      text: null,
    },
  };
  let transformed = false;

  try {
    const url = parameters.webhookURL;

    if (!url) {
      throw new Error('Missing webhook URL');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid webhook URL format');
    }

    let headers: Record<string, string>;
    try {
      headers = parseHeaders(parameters.headers);
    } catch (e: any) {
      throw new Error(`Failed to parse headers: ${e.message}`);
    }

    const response = await post(
      url,
      { ...context, eventType },
      { headers },
      parameters.timeout || 3000
    );
    verdict = response.verdict;

    if (
      response.transformedData?.request?.json &&
      eventType === 'beforeRequestHook'
    ) {
      transformedData.request.json = response.transformedData.request.json;
      transformed = true;
    }

    if (
      response.transformedData?.response?.json &&
      eventType === 'afterRequestHook'
    ) {
      transformedData.response.json = response.transformedData.response.json;
      transformed = true;
    }

    data = {
      verdict,
      explanation: verdict
        ? 'Webhook request succeeded'
        : 'Webhook request failed',
      webhookUrl: url,
      responseData: response.data,
      requestContext: {
        headers,
        timeout: 3000,
      },
    };
  } catch (e: any) {
    error = e;
    delete error.stack;

    data = {
      explanation: `Webhook error: ${e.message}`,
      webhookUrl: parameters.webhookURL || 'No URL provided',
      requestContext: {
        headers: parameters.headers || {},
        timeout: 3000,
      },
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
