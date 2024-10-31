import { PluginHandler } from '../types';
import { getText } from '../utils';

const endpointReachability = async (url: string): Promise<boolean> => {
  if (!url) return false;
  try {
    // Making a HEAD request as its lightweight (gets headers and doesn't wait for response)
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    // On all other cases like 403, 404, 500
    return false;
  }
};

export const handler: PluginHandler = async (
  context,
  _parameters,
  eventType,
  _options
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    let text = getText(context, eventType);
    verdict = await endpointReachability(text);
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
