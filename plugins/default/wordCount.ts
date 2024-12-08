import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function countWords(text: string): number {
  return text.split(/\s+/).length;
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
    const minCount = parameters.minWords;
    const maxCount = parameters.maxWords;
    let text = getText(context, eventType).trim();

    if (!text) {
      throw new Error('Missing text to analyze');
    }

    if (!Number.isInteger(minCount) || !Number.isInteger(maxCount)) {
      throw new Error('Invalid or missing word count range');
    }

    const count = countWords(text);
    verdict = count >= minCount && count <= maxCount;

    data = {
      wordCount: count,
      minWords: minCount,
      maxWords: maxCount,
      verdict,
      explanation: verdict
        ? `The text contains ${count} words, which is within the specified range of ${minCount}-${maxCount} words.`
        : `The text contains ${count} words, which is outside the specified range of ${minCount}-${maxCount} words.`,
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
      explanation: `An error occurred while processing word count: ${e.message}`,
      minWords: parameters.minWords,
      maxWords: parameters.maxWords,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
