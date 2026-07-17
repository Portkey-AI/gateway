import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { postFangcunGuard } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    const text = getText(context, eventType);

    // Nothing to scan -> allow.
    if (!text || !text.trim()) {
      return { error: null, verdict: true, data: null };
    }

    const result: any = await postFangcunGuard(
      parameters.credentials,
      text,
      parameters.timeout
    );

    // FangcunGuard returns is_safe (true = safe). Portkey verdict is true = pass,
    // so the mapping is direct.
    verdict = Boolean(result.is_safe);
    data = result;
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
