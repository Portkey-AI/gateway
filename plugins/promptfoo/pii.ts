import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { postPromptfoo } from './globals';
import { PIIResult, PromptfooResult } from './types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options: { env: Record<string, any> }
) => {
  let error = null;
  let verdict = true;
  let data = null;

  try {
    const piiObject = {
      input: getText(context, eventType),
    };

    const result = await postPromptfoo<PIIResult>('pii', piiObject);

    // If PII is detected, set verdict to false
    if (result.results[0].flagged) {
      verdict = false;
    }

    data = result.results[0];
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
