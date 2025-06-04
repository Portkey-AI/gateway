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
    const not = parameters.not || false;
    let requestModel = context.request?.json.model;

    if (!modelList || !Array.isArray(modelList)) {
      throw new Error('Missing or invalid model whitelist');
    }

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    const inList = modelList.includes(requestModel);
    verdict = not ? !inList : inList;

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? `Model "${requestModel}" is not in the allowed list as expected.`
          : `Model "${requestModel}" is allowed.`
        : not
          ? `Model "${requestModel}" is in the allowed list when it should not be.`
          : `Model "${requestModel}" is not in the allowed list.`,
      requestedModel: requestModel,
      allowedModels: modelList,
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: `An error occurred while checking model whitelist: ${e.message}`,
      requestedModel: context.request?.json.model || 'No model specified',
      not: parameters.not || false,
      allowedModels: parameters.models || [],
    };
  }

  return { error, verdict, data };
};
