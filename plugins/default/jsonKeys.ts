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
    const keys = parameters.keys;
    const operator = parameters.operator;
    let responseText = getText(context, eventType);

    // Extract JSON from code blocks and general text
    const extractJson = (text: string): string[] => {
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
    };

    const jsonMatches = extractJson(responseText);

    if (jsonMatches.length > 0) {
      for (const jsonMatch of jsonMatches) {
        let responseJson: any;
        try {
          responseJson = JSON.parse(jsonMatch);
        } catch (e) {
          continue;
        }

        responseJson = responseJson || {};

        const presentKeys = keys.filter((key: string) =>
          responseJson.hasOwnProperty(key)
        );
        const missingKeys = keys.filter(
          (key: string) => !responseJson.hasOwnProperty(key)
        );

        // Check if the JSON contains any, all or none of the keys
        switch (operator) {
          case 'any':
            verdict = presentKeys.length > 0;
            break;
          case 'all':
            verdict = missingKeys.length === 0;
            break;
          case 'none':
            verdict = presentKeys.length === 0;
            break;
        }

        if (verdict) {
          data = {
            matchedJson: responseJson,
            explanation: `Successfully matched JSON with '${operator}' keys criteria.`,
            presentKeys,
            missingKeys,
          };
          break;
        } else {
          data = {
            matchedJson: responseJson,
            explanation: `Failed to match JSON with '${operator}' keys criteria.`,
            presentKeys,
            missingKeys,
          };
        }
      }
    } else {
      data = {
        explanation: 'No valid JSON found in the response.',
        requiredKeys: keys,
        operator,
      };
    }
  } catch (e: any) {
    error = e;
    data = {
      explanation: 'An error occurred while processing the JSON.',
      error: e.message,
    };
  }

  return { error, verdict, data };
};
