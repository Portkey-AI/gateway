import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { PORTKEY_ENDPOINTS, fetchPortkey } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    // Get the text from the request or response
    const text = getText(context, eventType);

    // Check if the text is gibberish
    const result: any = await fetchPortkey(
      PORTKEY_ENDPOINTS.GIBBERISH,
      parameters.credentials,
      { text }
    );
    verdict = !result.results[0].isGibberish;
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
