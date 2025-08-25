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

  if (!parameters?.policies) {
    return {
      error: {
        message: 'Qualifire Policy guardrail requires policies to be provided.',
      },
      verdict: true,
      data,
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
    console.log(e); // TODO delete me
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
