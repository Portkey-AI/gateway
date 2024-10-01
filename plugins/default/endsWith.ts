import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    const suffix = parameters.suffix;
    let text = getText(context, eventType);

    if (suffix !== undefined && '' !== suffix && text.length >= 0) {
      verdict = text.endsWith(suffix) || text.endsWith(`${suffix}.`);
    } else {
      error = error || new Error('Missing suffix or text');
    }
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
