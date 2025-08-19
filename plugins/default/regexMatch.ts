import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getCurrentContentPart,
  getText,
  setCurrentContentPart,
} from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;
  let transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  try {
    const regexPattern = parameters.rule;
    const not = parameters.not || false;
    const redact = parameters.redact || false;
    const redactText = parameters.redactText || '[REDACTED]';

    // Use getCurrentContentPart like PII does
    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!regexPattern) {
      throw new Error('Missing regex pattern');
    }
    if (!content) {
      throw new Error('Missing text to match');
    }

    const regex = new RegExp(regexPattern, redact ? 'g' : '');

    // Check for matches across all text
    let hasMatches = false;
    const mappedTextArray: Array<string | null> = [];

    textArray.forEach((text) => {
      if (!text) {
        mappedTextArray.push(null);
        return;
      }

      // Check if pattern exists in text
      const localRegex = new RegExp(regexPattern, 'g');
      const matches = text.match(localRegex);

      if (matches && matches.length > 0) {
        hasMatches = true;

        if (redact) {
          const redactedText = text.replace(localRegex, redactText);
          mappedTextArray.push(redactedText);
        } else {
          mappedTextArray.push(null);
        }
      } else {
        mappedTextArray.push(null);
      }
    });

    // Handle redaction
    let shouldBlock = hasMatches;
    if (parameters.redact && hasMatches) {
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        mappedTextArray
      );
      shouldBlock = false;
      transformed = true;
    }

    verdict = not ? hasMatches : !shouldBlock;

    // For backward compatibility, also get single text for matchDetails
    const textToMatch = getText(context, eventType);
    const singleMatch = new RegExp(regexPattern).exec(textToMatch);

    data = {
      regexPattern,
      not,
      verdict,
      explanation: transformed
        ? `Pattern '${regexPattern}' matched and was redacted`
        : verdict
          ? not
            ? `The regex pattern '${regexPattern}' did not match the text as expected.`
            : `The regex pattern '${regexPattern}' successfully matched the text.`
          : not
            ? `The regex pattern '${regexPattern}' matched the text when it should not have.`
            : `The regex pattern '${regexPattern}' did not match the text.`,
      matchDetails: singleMatch
        ? {
            matchedText: singleMatch[0],
            index: singleMatch.index,
            groups: singleMatch.groups || {},
            captures: singleMatch.slice(1),
          }
        : null,
      textExcerpt:
        textToMatch?.length > 100
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

  return { error, verdict, data, transformedData, transformed };
};
