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
    const languages = parameters.language;
    const not = parameters.not || false;

    const result: any = await fetchPortkey(
      options?.env || {},
      PORTKEY_ENDPOINTS.LANGUAGE,
      parameters.credentials,
      { input: text },
      parameters.timeout
    );

    const predictedLanguage = result[0][0].label;
    const inLanguageList = languages.includes(predictedLanguage);
    verdict = not ? !inLanguageList : inLanguageList;

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? `The text is not in any of the specified languages (${languages.join(', ')}) as expected.`
          : `The text is in one of the specified languages (detected: ${predictedLanguage}).`
        : not
          ? `The text is in one of the specified languages (${languages.join(', ')}) when it should not be.`
          : `The text is not in any of the specified languages (detected: ${predictedLanguage}).`,
      analysis: result[0],
      detectedLanguage: predictedLanguage,
      allowedLanguages: languages,
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e) {
    error = e as Error;
    const text = getText(context, eventType);
    data = {
      explanation: `An error occurred while checking language: ${error.message}`,
      not: parameters.not || false,
      allowedLanguages: parameters.language || [],
      textExcerpt: text
        ? text.length > 100
          ? text.slice(0, 100) + '...'
          : text
        : 'No text available',
    };
  }

  return { error, verdict, data };
};
