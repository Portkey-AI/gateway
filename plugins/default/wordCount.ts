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
    const not = parameters.not || false;
    let text = getText(context, eventType).trim();

    if (!text) {
      throw new Error('Missing text to analyze');
    }

    if (!Number.isInteger(minCount) || !Number.isInteger(maxCount)) {
      throw new Error('Invalid or missing word count range');
    }

    const count = countWords(text);
    const inRange = count >= minCount && count <= maxCount;
    verdict = not ? !inRange : inRange;

    data = {
      wordCount: count,
      minWords: minCount,
      maxWords: maxCount,
      not,
      verdict,
      explanation: verdict
        ? not
          ? `The text contains ${count} words, which is outside the specified range of ${minCount}-${maxCount} words as expected.`
          : `The text contains ${count} words, which is within the specified range of ${minCount}-${maxCount} words.`
        : not
          ? `The text contains ${count} words, which is within the specified range of ${minCount}-${maxCount} words when it should not be.`
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
      not: parameters.not || false,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
