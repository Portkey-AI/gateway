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
    const words = parameters.words;
    const operator = parameters.operator;

    let responseText = getText(context, eventType);

    const foundWords = words.filter((word: string) =>
      responseText.includes(word)
    );
    const missingWords = words.filter(
      (word: string) => !responseText.includes(word)
    );

    switch (operator) {
      case 'any':
        verdict = foundWords.length > 0;
        break;
      case 'all':
        verdict = missingWords.length === 0;
        break;
      case 'none':
        verdict = foundWords.length === 0;
        break;
    }

    data = {
      explanation: `Check ${verdict ? 'passed' : 'failed'} for '${operator}' words.`,
      foundWords,
      missingWords,
      operator,
    };

    if (verdict) {
      switch (operator) {
        case 'any':
          data.explanation += ` At least one word was found.`;
          break;
        case 'all':
          data.explanation += ` All words were found.`;
          break;
        case 'none':
          data.explanation += ` No words were found.`;
          break;
      }
    } else {
      switch (operator) {
        case 'any':
          data.explanation += ` No words were found.`;
          break;
        case 'all':
          data.explanation += ` Some words were missing.`;
          break;
        case 'none':
          data.explanation += ` Some words were found.`;
          break;
      }
    }
  } catch (e: any) {
    error = e;
    data = {
      explanation: 'An error occurred while processing the text.',
      error: e.message,
    };
  }

  return { error, verdict, data };
};
