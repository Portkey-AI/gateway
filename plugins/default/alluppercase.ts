import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function isAllUpperCase(str: string): boolean {
  // Remove non-letter characters and compare the result to its uppercased version
  return str === str.toUpperCase();
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    let text = getText(context, eventType);
    verdict = isAllUpperCase(text);
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
