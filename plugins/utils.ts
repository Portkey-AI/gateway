import { HookEventType, PluginContext } from './types';

export const getText = (
  context: PluginContext,
  eventType: HookEventType
): string => {
  switch (eventType) {
    case 'beforeRequestHook':
      return context.request?.text;
    case 'afterRequestHook':
      return context.response?.text;
    default:
      throw new Error('Invalid hook type');
      break;
  }
};
