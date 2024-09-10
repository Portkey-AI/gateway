import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { ZodSchema, ZodError } from 'zod';
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
    const schema: ZodSchema<any> = parameters.schema;
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

    // We will find if there's at least one valid JSON object in the response
    if (jsonMatches.length > 0) {
      for (const [index, jsonMatch] of jsonMatches.entries()) {
        let responseJson;
        try {
          responseJson = JSON.parse(jsonMatch);
        } catch (e) {
          // The check will fail if the response is not valid JSON
          continue;
        }

        const validationResult = schema.safeParse(responseJson);
        if (validationResult.success) {
          verdict = true;
          data = {
            matchedJson: responseJson,
            explanation: `Successfully validated JSON against the provided schema.`,
          };
          break;
        } else {
          // If this is the last JSON object and none have passed, we'll include the error details
          if (index === jsonMatches.length - 1) {
            data = {
              matchedJson: responseJson,
              explanation: `Failed to validate JSON against the provided schema.`,
              validationErrors: (validationResult.error as ZodError).errors.map(
                (err) => ({
                  path: err.path.join('.'),
                  message: err.message,
                })
              ),
            };
          }
        }
      }
    } else {
      data = {
        explanation: 'No valid JSON found in the response.',
      };
    }
  } catch (e: any) {
    error = e;
    data = {
      explanation: 'An error occurred while processing the JSON.',
      error: e.message || e.toString(),
    };
  }

  return { error, verdict, data };
};
