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
  if (eventType !== 'afterRequestHook') {
    return {
      error: {
        message:
          'Qualifire Tool Use Quality guardrail only supports after_request_hooks.',
      },
      verdict: true,
      data: null,
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
    return { error: e, verdict: false, data: null };
  }
};
