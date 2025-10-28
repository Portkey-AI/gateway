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
  if (!parameters?.policies) {
    return {
      error: {
        message: 'Qualifire Policy guardrail requires policies to be provided.',
      },
      verdict: true,
      data: null,
    };
  }

  const evaluationBody: any = {
    input: context.request.text,
    assertions: parameters?.policies,
  };

  if (eventType === 'afterRequestHook') {
    evaluationBody.output = context.response.text;
  }

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    return { error: e, verdict: false, data: null };
  }
};
