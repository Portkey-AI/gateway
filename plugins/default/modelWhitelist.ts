import type {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

interface WhitelistData {
  explanation: string;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: WhitelistData | null = null;

  try {
    const modelList = parameters.models;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    // Use explicit models list only
    const allowedSet = Array.isArray(modelList)
      ? modelList.map(String).filter(Boolean)
      : [];

    if (!Array.isArray(allowedSet) || allowedSet.length === 0) {
      throw new Error('Missing allowed models configuration');
    }

    const inList = allowedSet.includes(requestModel);
    verdict = not ? !inList : inList;

    let explanation = '';
    if (verdict) {
      explanation = not
        ? `Model "${requestModel}" is not in the blocked list.`
        : `Model "${requestModel}" is allowed.`;
    } else {
      explanation = not
        ? `Model "${requestModel}" is in the blocked list.`
        : `Model "${requestModel}" is not in the allowed list.`;
    }

    data = { explanation };
  } catch (e) {
    const err = e as Error;
    error = err;
    data = {
      explanation: `An error occurred while checking model whitelist: ${err.message}`,
    };
  }

  return { error, verdict, data };
};
