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
  let data: any = null;

  try {
    const modelList = parameters.models;
    let requestModel = context.request?.json.model;

    if (!modelList || !Array.isArray(modelList)) {
      throw new Error('Missing or invalid model whitelist');
    }

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    verdict = modelList.includes(requestModel);

    data = {
      verdict,
      explanation: verdict
        ? `Model "${requestModel}" is allowed.`
        : `Model "${requestModel}" is not in the allowed list.`,
      requestedModel: requestModel,
      allowedModels: modelList,
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while checking model whitelist: ${e.message}`,
      requestedModel: context.request?.json.model || 'No model specified',
      allowedModels: parameters.models || [],
    };
  }

  return { error, verdict, data };
};
