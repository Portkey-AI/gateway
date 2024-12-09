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
    const not = parameters.not || false;
    let textToMatch = getText(context, eventType);

    if (!regexPattern) {
      throw new Error('Missing regex pattern');
    }

    if (!textToMatch) {
      throw new Error('Missing text to match');
    }

    const regex = new RegExp(regexPattern);
    const match = regex.exec(textToMatch);

    // Determine verdict based on not parameter
    const matches = match !== null;
    verdict = not ? !matches : matches;

    data = {
      regexPattern,
      not,
      verdict,
      explanation: verdict
        ? not
          ? `The regex pattern '${regexPattern}' did not match the text as expected.`
          : `The regex pattern '${regexPattern}' successfully matched the text.`
        : not
          ? `The regex pattern '${regexPattern}' matched the text when it should not have.`
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
    let textExcerpt = getText(context, eventType);
    textExcerpt =
      textExcerpt?.length > 100
        ? textExcerpt.slice(0, 100) + '...'
        : textExcerpt;
    data = {
      explanation: `An error occurred while processing the regex: ${e.message}`,
      regexPattern: parameters.rule,
      not: parameters.not || false,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
