import { PluginContext, PluginHandler, PluginParameters } from '../types';
import { post } from '../utils';

function parseHeaders(headers: unknown): Record<string, string> {
  if (typeof headers === 'object' && headers !== null) {
    return headers as Record<string, string>;
  }
  if (typeof headers === 'string') {
    return JSON.parse(headers);
  }
  return {};
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters
) => {
  let error = null;
  let verdict = false;
  let data = null;
  try {
    let url = parameters.webhookURL;

    let headers: Record<string, string> = parameters?.headers
      ? JSON.parse(parameters.headers)
      : {};

    // Remove metadata from context if sendMetadata is false
    if (!parameters.sendMetadata) {
      delete context.metadata;
    }

    ({ verdict, data } = await post(url, context, { headers }, 3000));
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
