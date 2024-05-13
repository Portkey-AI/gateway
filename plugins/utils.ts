import { PluginContext } from './types';

export const getText = (context: PluginContext): string => {
  let text = '';

  switch (context.hookType) {
    case 'beforeRequestHook':
      return context.request?.text;
    case 'afterResponseHook':
      return context.response?.text;
    default:
      throw new Error('Invalid hook type');
      break;
  }
};
