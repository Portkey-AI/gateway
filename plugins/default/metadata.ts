import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  _eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const pairs = parameters.pairs;
    const operator = parameters.operator || 'all';
    const not = parameters.not || false;

    if (!pairs) {
      throw new Error('Missing metadata pairs parameter');
    }
    
    if (typeof pairs !== 'object' || Array.isArray(pairs)) {
      throw new Error('Metadata pairs must be an object with key-value pairs');
    }

    if (!context.metadata) {
      data = {
        verdict: false,
        explanation: 'No metadata provided in the request context',
        operator,
        not,
        foundKeys: [],
        missingKeys: Object.keys(pairs)
      };
      return { error: null, verdict: not, data };
    }
    
    const metadata = context.metadata;
    const foundKeys: string[] = [];
    const missingKeys: string[] = [];

    for (const [key, value] of Object.entries(pairs)) {
      if (metadata[key] === value) {
        foundKeys.push(key);
      } else {
        missingKeys.push(key);
      }
    }

    let result = false;
    if (operator === 'any') {
      result = foundKeys.length > 0;
    } else if (operator === 'all') {
      result = missingKeys.length === 0;
    } else if (operator === 'none') {
      result = foundKeys.length === 0;
    } else {
      throw new Error(`Invalid operator: ${operator}. Must be one of: any, all, none`);
    }

    verdict = not ? !result : result;
    data = {
      verdict,
      not,
      operator,
      foundKeys,
      missingKeys,
      explanation: verdict
        ? not
          ? 'Metadata does not match the specified pairs as expected.'
          : 'Metadata matches the specified pairs.'
        : not
          ? 'Metadata matches the specified pairs when it should not.'
          : 'Metadata does not match the specified pairs.',
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while verifying metadata: ${e.message}`,
      operator: parameters.operator || 'all',
      not: parameters.not || false,
    };
  }

  return { error, verdict, data };
};
