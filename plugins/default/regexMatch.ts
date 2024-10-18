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
    const regexPattern = parameters.rule;
    let textToMatch = getText(context, eventType);

    if (!regexPattern) {
      throw new Error('Missing regex pattern');
    }

    if (!textToMatch) {
      throw new Error('Missing text to match');
    }

    const regex = new RegExp(regexPattern);
    const match = regex.exec(textToMatch);

    verdict = match !== null;

    data = {
      regexPattern,
      verdict,
      explanation: verdict
        ? `The regex pattern '${regexPattern}' successfully matched the text.`
        : `The regex pattern '${regexPattern}' did not match the text.`,
      matchDetails: match
        ? {
            matchedText: match[0],
            index: match.index,
            groups: match.groups || {},
            captures: match.slice(1),
          }
        : null,
      textExcerpt:
        textToMatch.length > 100
          ? textToMatch.slice(0, 100) + '...'
          : textToMatch,
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while processing the regex: ${e.message}`,
      regexPattern: parameters.rule,
      textExcerpt:
        getText(context, eventType)?.slice(0, 100) + '...' ||
        'No text available',
    };
  }

  return { error, verdict, data };
};
