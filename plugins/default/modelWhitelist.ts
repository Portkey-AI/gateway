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
    mode?: 'policy' | 'metadata_rules' | 'base_models';
    matchedMetadata?: Record<string, unknown>;
    explanation?: string;
    requestedModel?: string;
    allowedModels?: string[];
  } | null = null;

  try {
    const modelList = parameters.models;
    // Support unwrapped JSON: defaults and metadata at top-level
    const topLevelDefaults = Array.isArray(
      (parameters as Record<string, unknown>).defaults as unknown[]
    )
      ? ((parameters as Record<string, unknown>).defaults as string[])
      : undefined;
    const rawMetadata = (parameters as Record<string, unknown>)
      .metadata as unknown;
    const topLevelMetadata =
      rawMetadata && typeof rawMetadata === 'object'
        ? (rawMetadata as Record<string, Record<string, string[]>>)
        : undefined;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    // Build allowed set with precedence:
    // 1) unwrapped defaults/metadata
    // 2) modelList (legacy base)
    let allowedSet: string[] = [];
    let mode: 'policy' | 'metadata_rules' | 'base_models' = 'base_models';

    // Unwrapped policy path
    const effectivePolicy =
      topLevelDefaults || topLevelMetadata
        ? { defaults: topLevelDefaults ?? [], metadata: topLevelMetadata ?? {} }
        : undefined;

    if (effectivePolicy) {
      const matched: Set<string> = new Set();
      const policyMetadata = effectivePolicy.metadata || {};
      for (const key of Object.keys(policyMetadata)) {
        const mapping = policyMetadata[key] || {};
        const reqVal = (requestMetadata as Record<string, unknown>)[key];
        if (reqVal === undefined || reqVal === null) continue;
        const reqVals: string[] = Array.isArray(reqVal)
          ? (reqVal as unknown[]).map((v) => String(v))
          : [String(reqVal)];
        for (const val of reqVals) {
          const models = mapping[String(val)];
          if (Array.isArray(models)) {
            for (const m of models) matched.add(String(m));
          }
        }
      }
      allowedSet = Array.from(matched);
      if (allowedSet.length === 0 && Array.isArray(effectivePolicy.defaults)) {
        allowedSet = effectivePolicy.defaults;
      }
      mode = 'policy';
    }

    // Fallback to base modelList if no metadata rule matched or no rules configured
    if (allowedSet.length === 0 && Array.isArray(modelList)) {
      allowedSet = modelList;
      mode = 'base_models';
    }

    // If unwrapped defaults/metadata provided and allowedSet still empty, it's a deny by configuration (no defaults, no match)
    // For legacy models path, empty set indicates misconfiguration
    const shouldErrorOnEmpty = !effectivePolicy;
    if (
      (!Array.isArray(allowedSet) || allowedSet.length === 0) &&
      shouldErrorOnEmpty
    ) {
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
      explanation: `An error occurred while checking model whitelist: ${err.message}`,
      requestedModel: context.request?.json.model || 'No model specified',
      not: parameters.not || false,
      allowedModels: Array.isArray(parameters?.models)
        ? (parameters.models as string[])
        : [],
    };
  }

  return { error, verdict, data };
};
