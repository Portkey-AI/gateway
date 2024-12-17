import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

// Extract JSON from code blocks and general text
function extractJson(text: string): string[] {
  const codeBlockRegex = /```+(?:json)?\s*([\s\S]*?)```+/g;
  const jsonRegex = /{[\s\S]*?}/g;
  const matches = [];

  // Extract from code blocks
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }

  // Extract JSON-like structures
  while ((match = jsonRegex.exec(text)) !== null) {
    matches.push(match[0]);
  }

  return matches;
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
    const keys = parameters.keys;
    const operator = parameters.operator;
    let text = getText(context, eventType);

    if (!text) {
      throw new Error('Missing text to analyze');
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('Missing or invalid keys array');
    }

    if (!operator || !['any', 'all', 'none'].includes(operator)) {
      throw new Error(
        'Invalid or missing operator (must be "any", "all", or "none")'
      );
    }

    const jsonMatches = extractJson(text);

    if (jsonMatches.length === 0) {
      data = {
        explanation: 'No valid JSON found in the text.',
        requiredKeys: keys,
        operator,
        textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
      };
      return { error, verdict, data };
    }

    interface BestMatch {
      json: any;
      presentKeys: string[];
      missingKeys: string[];
      verdict: boolean;
    }

    let bestMatch: BestMatch = {
      json: null,
      presentKeys: [],
      missingKeys: keys,
      verdict: false,
    };

    for (const jsonMatch of jsonMatches) {
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(jsonMatch);
      } catch (e) {
        continue;
      }

      const presentKeys = keys.filter((key) => parsedJson.hasOwnProperty(key));
      const missingKeys = keys.filter((key) => !parsedJson.hasOwnProperty(key));

      let currentVerdict = false;
      switch (operator) {
        case 'any':
          currentVerdict = presentKeys.length > 0;
          break;
        case 'all':
          currentVerdict = missingKeys.length === 0;
          break;
        case 'none':
          currentVerdict = presentKeys.length === 0;
          break;
      }

      // Update best match if this is a better result
      if (currentVerdict || presentKeys.length > bestMatch.presentKeys.length) {
        bestMatch = {
          json: parsedJson,
          presentKeys,
          missingKeys,
          verdict: currentVerdict,
        };
      }

      if (currentVerdict) {
        break; // Found a valid match, no need to continue
      }
    }

    verdict = bestMatch.verdict;
    data = {
      matchedJson: bestMatch.json,
      verdict,
      explanation: getExplanation(
        operator,
        bestMatch.presentKeys,
        bestMatch.missingKeys,
        verdict
      ),
      presentKeys: bestMatch.presentKeys,
      missingKeys: bestMatch.missingKeys,
      operator,
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
      explanation: `An error occurred while processing JSON: ${e.message}`,
      operator: parameters.operator,
      requiredKeys: parameters.keys,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};

function getExplanation(
  operator: string,
  presentKeys: string[],
  missingKeys: string[],
  verdict: boolean
): string {
  const presentKeysList =
    presentKeys.length > 0
      ? `Found keys: [${presentKeys.join(', ')}]`
      : 'No matching keys found';
  const missingKeysList =
    missingKeys.length > 0
      ? `Missing keys: [${missingKeys.join(', ')}]`
      : 'No missing keys';

  switch (operator) {
    case 'any':
      return verdict
        ? `Successfully found at least one required key. ${presentKeysList}.`
        : `Failed to find any required keys. ${missingKeysList}.`;
    case 'all':
      return verdict
        ? `Successfully found all required keys. ${presentKeysList}.`
        : `Failed to find all required keys. ${missingKeysList}.`;
    case 'none':
      return verdict
        ? `Successfully verified no required keys are present. ${missingKeysList}.`
        : `Found some keys that should not be present. ${presentKeysList}.`;
    default:
      return 'Invalid operator specified.';
  }
}
