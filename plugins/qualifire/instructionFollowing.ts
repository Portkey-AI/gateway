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
  if (eventType !== 'afterRequestHook') {
    return {
      error: {
        message:
          'Qualifire Instruction Following guardrail only supports after_request_hooks.',
      },
      verdict: true,
      data: null,
    };
  }

  const evaluationBody: any = {
    input: context.request.text,
    output: context.response.text,
    instructions_following_check: true,
  };

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    return { error: e, verdict: false, data: null };
  }
};
