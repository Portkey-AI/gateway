import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { postPromptfoo } from './globals';
import { GuardResult, PromptfooResult } from './types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  try {
    const guardObject = {
      input: getText(context, eventType),
    };

    const result = await postPromptfoo<GuardResult>(
      'guard',
      guardObject,
      parameters.timeout
    );

    // For now, we only check for jailbreak
    if (result.results[0].categories.jailbreak) {
      verdict = false;
    }

    data = result.results[0];
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
