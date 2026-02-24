import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { postPatronus } from './globals';

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
        message: 'Patronus guardrails only support after_request_hooks.',
      },
      verdict: true,
      data,
    };
  }

  // Validate and parse profile format
  // Supports: "evaluator:criteria" (e.g., "judge:my-custom-criteria", "glider:custom")
  // Or shorthand: "my-custom" defaults to "judge:my-custom" since judge is most common
  const profileOrCriteria = parameters.profile || parameters.criteria;

  if (!profileOrCriteria) {
    return {
      error: {
        message:
          'Profile parameter is required. Format: "evaluator:criteria" (e.g., "judge:my-custom-criteria") or shorthand "my-custom" (defaults to judge evaluator)',
      },
      verdict: true,
      data,
    };
  }

  let evaluator = 'judge';
  let criteria = profileOrCriteria;

  // Parse profile format if it contains ':'
  if (profileOrCriteria.includes(':')) {
    const parts = profileOrCriteria.split(':');
    evaluator = parts[0];
    criteria = parts.slice(1).join(':'); // Join remaining parts in case criteria contains ':'
  }
  // Otherwise use default 'judge' evaluator with profileOrCriteria as criteria

  const evaluationBody: any = {
    input: context.request.text,
    output: context.response.text,
  };

  try {
    const result: any = await postPatronus(
      evaluator,
      parameters.credentials,
      evaluationBody,
      parameters.timeout || 15000,
      criteria
    );

    const evalResult = result.results[0];
    error = evalResult.error_message;

    // verdict can be true/false
    verdict = evalResult.evaluation_result.pass;

    data = evalResult.evaluation_result.additional_info;
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
