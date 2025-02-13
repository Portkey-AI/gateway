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
  eventType: HookEventType,
  options
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const text = getText(context, eventType);
    const not = parameters.not || false;

    const response: any = await fetchPortkey(
      options?.env || {},
      PORTKEY_ENDPOINTS.GIBBERISH,
      parameters.credentials,
      { input: text },
      parameters.timeout
    );

    const isClean = response[0][0].label === 'clean';
    verdict = not ? !isClean : isClean;

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? 'The text is gibberish as expected.'
          : 'The text is not gibberish.'
        : not
          ? 'The text is not gibberish when it should be.'
          : 'The text appears to be gibberish.',
      analysis: response[0],
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e) {
    error = e as Error;
    const text = getText(context, eventType);
    data = {
      explanation: `An error occurred while checking for gibberish: ${error.message}`,
      not: parameters.not || false,
      textExcerpt: text
        ? text.length > 100
          ? text.slice(0, 100) + '...'
          : text
        : 'No text available',
    };
  }

  return { error, verdict, data };
};
