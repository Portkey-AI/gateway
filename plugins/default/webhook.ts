import { PluginContext, PluginHandler, PluginParameters } from '../types';
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
  parameters: PluginParameters
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

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

    const response = await post(url, context, { headers }, 3000);
    verdict = response.verdict;

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

  return { error, verdict, data };
};
