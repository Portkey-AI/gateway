import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';

function parseRegex(input: string): RegExp {
  // Valid JavaScript regex flags
  const validFlags = /^[gimsuyd]*$/;

  const match = input.match(/^\/(.+?)\/([gimsuyd]*)$/);
  if (match) {
    const [, pattern, flags] = match;

    if (flags && !validFlags.test(flags)) {
      throw new Error(`Invalid regex flags: ${flags}`);
    }

    return new RegExp(pattern, flags);
  }

  return new RegExp(input);
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: any = null;
  const transformedData: Record<string, any> = {
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
    const redactText = parameters.redactText || '[REDACTED]';
    const failOnDetection = parameters.failOnDetection || false;

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!regexPattern) {
      throw new Error('Missing regex pattern');
    }
    if (!content) {
      throw new Error('Missing text to match');
    }

    const regex = parseRegex(regexPattern);

    // Process all text items in the array
    let hasMatches = false;
    const mappedTextArray: Array<string | null> = [];
    textArray.forEach((text) => {
      if (!text) {
        mappedTextArray.push(null);
        return;
      }

      // Reset regex for each text when using global flag
      regex.lastIndex = 0;

      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        hasMatches = true;
      }
      const replacedText = text.replace(regex, redactText);
      mappedTextArray.push(replacedText);
    });

    // Handle transformation
    if (hasMatches) {
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        mappedTextArray
      );
      transformed = true;
    }
    if (failOnDetection && hasMatches) {
      verdict = false;
    }
    data = {
      regexPattern,
      verdict,
      explanation: transformed
        ? `Pattern '${regexPattern}' matched and was replaced with '${redactText}'`
        : `The regex pattern '${regexPattern}' did not match any text.`,
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while processing the regex: ${e.message}`,
      regexPattern: parameters.rule,
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
