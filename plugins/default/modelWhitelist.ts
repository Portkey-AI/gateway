import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;

  try {
    const modelList = parameters.models;
    let requestModel = context.request?.json.model;
    verdict = modelList.includes(requestModel);
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict };
};
