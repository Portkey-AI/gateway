import { PluginContext } from './types';

export const getText = (context: PluginContext): string => {
  switch (context.hookType) {
    case 'beforeRequestHook':
      return context.request?.text;
    case 'afterRequestHook':
      return context.response?.text;
    default:
      throw new Error('Invalid hook type');
      break;
  }
};
