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
      verdict,
      data,
    };
  }

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
