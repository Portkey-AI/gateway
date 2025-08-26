import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { postQualifire } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  if (eventType !== 'afterRequestHook') {
    return {
      error: {
        message:
          'Qualifire Word Count guardrail only supports after_request_hooks.',
      },
      verdict: true,
      data,
    };
  }

  if (!parameters?.wordCountConstraint) {
    return {
      error: {
        message:
          'Qualifire Word Count guardrail requires a word count constraint to be provided.',
      },
      verdict: true,
      data,
    };
  }

  const evaluationBody: any = {
    input: context.request.text,
    output: context.response.text,
    syntax_checks: {
      word_count: { args: parameters?.wordCountConstraint },
    },
  };

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
