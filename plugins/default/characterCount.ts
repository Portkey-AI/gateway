import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function countCharacters(text: string): number {
  return text.length;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const minCount = parameters.minCharacters;
    const maxCount = parameters.maxCharacters;
    let text = getText(context, eventType);

    if (!text) {
      throw new Error('Missing text to analyze');
    }

    if (!Number.isInteger(minCount) || !Number.isInteger(maxCount)) {
      throw new Error('Invalid or missing character count range');
    }

    const count = countCharacters(text);
    verdict = count >= minCount && count <= maxCount;

    data = {
      characterCount: count,
      minCharacters: minCount,
      maxCharacters: maxCount,
      verdict,
      explanation: verdict
        ? `The text contains ${count} characters, which is within the specified range of ${minCount}-${maxCount} characters.`
        : `The text contains ${count} characters, which is outside the specified range of ${minCount}-${maxCount} characters.`,
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
      explanation: `An error occurred while counting characters: ${e.message}`,
      minCharacters: parameters.minCharacters,
      maxCharacters: parameters.maxCharacters,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
