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
  const evaluationBody: any = {
    input: context.request.text,
    prompt_injections: true,
  };

  if (eventType !== 'beforeRequestHook') {
    return {
      error: {
        message:
          'Qualifire Prompt Injections guardrail only supports before_request_hooks.',
      },
      verdict: false,
      data: null,
    };
  }

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    return { error: e, verdict: false, data: null };
  }
};
