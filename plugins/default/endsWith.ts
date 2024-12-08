import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const suffix = parameters.suffix;
    let text = getText(context, eventType);

    if (!text) {
      throw new Error('Missing text to analyze');
    }

    if (!suffix || suffix === '') {
      throw new Error('Missing or empty suffix');
    }

    verdict = text.endsWith(suffix) || text.endsWith(`${suffix}.`);

    data = {
      suffix,
      verdict,
      explanation: verdict
        ? `The text ends with "${suffix}"${text.endsWith(`${suffix}.`) ? ' (including trailing period)' : ''}.`
        : `The text does not end with "${suffix}".`,
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e: any) {
    error = e;
    let textExcerpt = getText(context, eventType);
    textExcerpt =
      textExcerpt?.length > 100
        ? textExcerpt.slice(0, 100) + '...'
        : textExcerpt;

    data = {
      explanation: `An error occurred while checking suffix: ${e.message}`,
      suffix: parameters.suffix,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
