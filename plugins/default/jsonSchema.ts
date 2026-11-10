import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { Validator } from '@cfworker/json-schema';
import { getText, extractJson } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const schema = parameters.schema;
    const not = parameters.not || false;
    if (!schema || typeof schema !== 'object') {
      throw new Error('Missing or invalid JSON schema');
    }

    // Create validator with the provided schema
    const validator = new Validator(schema, '2020-12', false); // Using latest draft, with shortCircuit=false to get all errors
    let responseText = getText(context, eventType);

    const jsonMatches = extractJson(responseText);

    // We will find if there's at least one valid JSON object in the response
    if (jsonMatches.length > 0) {
      let bestMatch = {
        json: null as any,
        errors: [] as any[],
        isValid: false,
      };

      for (const jsonMatch of jsonMatches) {
        let responseJson;
        try {
          responseJson = JSON.parse(jsonMatch);
        } catch (e) {
          continue;
        }

        const result = validator.validate(responseJson);
        const isValid = result.valid;

        // Store this result if it's valid or if it's the first one we've processed
        if (isValid || bestMatch.json === null) {
          bestMatch = {
            json: responseJson,
            errors: result.errors || [],
            isValid,
          };
        }

        // If we found a valid match, no need to check others
        if (isValid) {
          break;
        }
      }

      if (bestMatch.json) {
        verdict = not ? !bestMatch.isValid : bestMatch.isValid;
        data = {
          matchedJson: bestMatch.json,
          not,
          explanation: verdict
            ? not
              ? `Successfully validated JSON does not match the schema as expected.`
              : `Successfully validated JSON against the provided schema.`
            : not
              ? `JSON matches the schema when it should not.`
              : `Failed to validate JSON against the provided schema.`,
          validationErrors: bestMatch.errors.map((err) => {
            // Convert the error location array to a JSON path string
            const path = err.location
              ? '/' + err.location.join('/')
              : err.instancePath || '';

            // Get a clean error message without the path information
            const message = err.error.replace(/^\/[^ ]+ /, '');

            return {
              path,
              message,
            };
          }),
        };
      } else {
        data = {
          explanation: 'No valid JSON found in the response.',
          not,
        };
      }
    } else {
      data = {
        explanation: 'No valid JSON found in the response.',
        not,
      };
    }
  } catch (e: any) {
    error = e;
    data = {
      explanation: 'An error occurred while processing the JSON.',
      error: e.message || e.toString(),
      not: parameters.not || false,
    };
  }

  return { error, verdict, data };
};
