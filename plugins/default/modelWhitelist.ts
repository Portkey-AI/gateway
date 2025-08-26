import type {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

interface WhitelistData {
  verdict: boolean;
  not: boolean;
  mode: 'json' | 'default';
  matchedMetadata: Record<string, unknown>;
  explanation: string;
  requestedModel: string;
  allowedModels: string[];
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
    const jsonConfig = parameters.json as Record<string, unknown> | undefined;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    let allowedSet: string[] = [];
    let mode: 'json' | 'default' = 'default';

    // Check if JSON configuration is provided
    if (jsonConfig && typeof jsonConfig === 'object') {
      const defaults = Array.isArray(jsonConfig.defaults)
        ? jsonConfig.defaults
        : [];
      const metadata =
        jsonConfig.metadata && typeof jsonConfig.metadata === 'object'
          ? (jsonConfig.metadata as Record<string, Record<string, string[]>>)
          : {};

      // Match metadata rules
      const matched = new Set<string>();
      for (const [key, mapping] of Object.entries(metadata)) {
        const reqVal = requestMetadata[key];
        if (reqVal === undefined || reqVal === null) continue;

        const reqVals = Array.isArray(reqVal)
          ? reqVal.map((v) => String(v))
          : [String(reqVal)];

        for (const val of reqVals) {
          const models = mapping[val];
          if (Array.isArray(models)) {
            for (const m of models) matched.add(String(m));
          }
        }
      }

      allowedSet = Array.from(matched);
      if (allowedSet.length === 0) {
        allowedSet = defaults;
      }
      mode = 'json';
    } else if (Array.isArray(modelList)) {
      // Use legacy models list
      allowedSet = modelList;
      mode = 'default';
    }

    if (!Array.isArray(allowedSet) || allowedSet.length === 0) {
      throw new Error('Missing allowed models configuration');
    }

    const inList = allowedSet.includes(requestModel);
    verdict = not ? !inList : inList;

    data = {
      verdict,
      not,
      mode,
      matchedMetadata: requestMetadata,
      explanation: verdict
        ? not
          ? `Model "${requestModel}" is not in the allowed list as expected.`
          : `Model "${requestModel}" is allowed.`
        : not
          ? `Model "${requestModel}" is in the allowed list when it should not be.`
          : `Model "${requestModel}" is not in the allowed list.`,
      requestedModel: requestModel,
      allowedModels: allowedSet,
    };
  } catch (e) {
    const err = e as Error;
    error = err;
    data = {
      verdict: false,
      not: parameters.not || false,
      mode: 'default',
      matchedMetadata: context?.metadata || {},
      explanation: `An error occurred while checking model whitelist: ${err.message}`,
      requestedModel: context.request?.json.model || 'No model specified',
      allowedModels: Array.isArray(parameters?.models)
        ? (parameters.models as string[])
        : [],
    };
  }

  return { error, verdict, data };
};
