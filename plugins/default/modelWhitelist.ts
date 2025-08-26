import type {
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
  let data: {
    verdict?: boolean;
    not?: boolean;
    mode?: 'metadata_rules' | 'base_models';
    matchedMetadata?: Record<string, unknown>;
    explanation?: string;
    requestedModel?: string;
    allowedModels?: string[];
  } | null = null;

  try {
    const modelList = parameters.models;
    const metadataRules = parameters.metadataRules as
      | Array<{
          metadataKey: string;
          values: string[];
          models: string[];
        }>
      | undefined;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    // Build allowed set: if any metadata rule matches, use union of matched rule models.
    // Otherwise, fall back to base modelList (if provided).
    let allowedSet: string[] = [];

    if (Array.isArray(metadataRules) && metadataRules.length > 0) {
      const matchedModels: Set<string> = new Set();
      for (const rule of metadataRules) {
        if (!rule || !rule.metadataKey || !Array.isArray(rule.values)) continue;
        const reqVal = requestMetadata?.[rule.metadataKey];
        if (reqVal === undefined || reqVal === null) continue;

        const reqVals: string[] = Array.isArray(reqVal)
          ? (reqVal as unknown[]).map((v) => String(v))
          : [String(reqVal)];
        const intersects = reqVals.some((v) => rule.values.includes(String(v)));
        if (intersects && Array.isArray(rule.models)) {
          for (const m of rule.models) {
            matchedModels.add(String(m));
          }
        }
      }
      allowedSet = Array.from(matchedModels);
    }

    // Fallback to base modelList if no metadata rule matched or no rules configured
    if (allowedSet.length === 0 && Array.isArray(modelList)) {
      allowedSet = modelList;
    }

    if (!Array.isArray(allowedSet) || allowedSet.length === 0) {
      throw new Error('Missing allowed models configuration');
    }

    const inList = allowedSet.includes(requestModel);
    verdict = not ? !inList : inList;

    data = {
      verdict,
      not,
      mode:
        Array.isArray(metadataRules) && metadataRules.length > 0
          ? 'metadata_rules'
          : 'base_models',
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
      explanation: `An error occurred while checking model whitelist: ${err.message}`,
      requestedModel: context.request?.json.model || 'No model specified',
      not: parameters.not || false,
      allowedModels: Array.isArray(parameters?.models)
        ? (parameters.models as string[])
        : Array.isArray(parameters?.metadataRules)
          ? (
              parameters.metadataRules as Array<{
                metadataKey: string;
                values: string[];
                models: string[];
              }>
            )
              .flatMap((r) => (Array.isArray(r?.models) ? r.models : []))
              .filter((v, i, a) => a.indexOf(v) === i)
          : [],
    };
  }

  return { error, verdict, data };
};
