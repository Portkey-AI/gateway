import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function isAllLowerCase(str: string): boolean {
  // Remove non-letter characters and compare the result to its lowercased version
  return str === str.toLowerCase();
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
    verdict = isAllLowerCase(text);
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
