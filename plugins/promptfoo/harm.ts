import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { postPromptfoo } from './globals';
import { HarmResult } from './types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  try {
    const harmObject = {
      input: getText(context, eventType),
    };

    const result = await postPromptfoo<HarmResult>(
      'harm',
      harmObject,
      parameters.timeout
    );

    // If any harm category is flagged, set verdict to false
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
