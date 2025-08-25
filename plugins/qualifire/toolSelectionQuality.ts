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
          'Qualifire Tool Selection Quality guardrail only supports after_request_hooks.',
      },
      verdict: true,
      data,
    };
  }

  const evaluationBody: any = {
    // TODO build correct body
    input: context.request.text,
    output: context.response.text,
    tool_selection_quality_check: true,
  };

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    console.log(e); // TODO delete me
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
