import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { postQualifire } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  const evaluationBody: any = {
    input: context.request.text,
    prompt_injections: true,
  };

  try {
    return await postQualifire(evaluationBody, parameters?.credentials?.apiKey);
  } catch (e: any) {
    console.log(e); // TODO delete me
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
