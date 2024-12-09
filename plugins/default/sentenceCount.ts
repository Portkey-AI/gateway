import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function countSentences(text: string): number {
  return text.split(/[.!?]/).length - 1;
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
    const minCount = parameters.minSentences;
    const maxCount = parameters.maxSentences;
    const not = parameters.not || false;
    let text = getText(context, eventType);

    if (typeof minCount !== 'number' || typeof maxCount !== 'number') {
      throw new Error('Missing sentence count range');
    }

    // Treat empty string as valid input with 0 sentences
    text = text || '';
    let count = countSentences(text);
    const inRange = count >= minCount && count <= maxCount;
    verdict = not ? !inRange : inRange;

    data = {
      sentenceCount: count,
      minCount,
      maxCount,
      not,
      verdict,
      explanation: verdict
        ? not
          ? `The sentence count (${count}) is outside the specified range of ${minCount} to ${maxCount} as expected.`
          : `The sentence count (${count}) is within the specified range of ${minCount} to ${maxCount}.`
        : not
          ? `The sentence count (${count}) is within the specified range of ${minCount} to ${maxCount} when it should not be.`
          : `The sentence count (${count}) is outside the specified range of ${minCount} to ${maxCount}.`,
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e: any) {
    error = e;
    let text = getText(context, eventType) || 'No text available';
    data = {
      explanation: `An error occurred: ${e.message}`,
      minCount: parameters.minSentences,
      maxCount: parameters.maxSentences,
      not: parameters.not || false,
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  }

  return { error, verdict, data };
};
