import { PluginContext, PluginHandler, PluginParameters } from '../types';
import { getText } from '../utils';
import { PORTKEY_ENDPOINTS, fetchPortkey } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    // Get the text from the request or response
    const text = getText(context);
    const language = parameters.language;

    // Find the language of the text
    const result:any = await fetchPortkey(PORTKEY_ENDPOINTS.LANGUAGE, parameters.credentials, {text});
    const predictedLanguage = result.results[0].label;

    // Check if the predicted language matches the language set in the parameters
    if (predictedLanguage === language) {
      verdict = true;
    } else {
      verdict = false;
      data = {predicted_language: predictedLanguage};
    }

  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data};
};
