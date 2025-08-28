import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  convertToMessages,
  parseAvailableTools,
  postQualifire,
} from './globals';

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
          'Qualifire Tool Use Quality guardrail only supports after_request_hooks.',
      },
      verdict: true,
      data,
    };
  }

  const evaluationBody: any = {
    messages: convertToMessages(context.request, context.response),
    available_tools: parseAvailableTools(context.request),
    tool_selection_quality_check: true,
  };

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
