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

  const mode = parameters?.mode || 'balanced';
  const policyTarget = parameters?.policy_target || 'both';

  const evaluationBody: any = {
    assertions: parameters?.policies,
    assertions_mode: mode,
  };

  // Add input based on policy_target
  if (policyTarget === 'input' || policyTarget === 'both') {
    evaluationBody.input = context.request.text;
  }

  // Add output based on policy_target and hook type
  if (
    eventType === 'afterRequestHook' &&
    (policyTarget === 'output' || policyTarget === 'both')
  ) {
    evaluationBody.output = context.response.text;
  }

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    delete e.stack;
    return { error: e, verdict: false, data: null };
  }
};
