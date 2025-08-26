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
  matchedRules?: string[]; // Which metadata rules were matched
  fallbackUsed?: boolean; // Whether defaults were used
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
        ? jsonConfig.defaults.map(String)
        : [];
      const metadata =
        jsonConfig.metadata && typeof jsonConfig.metadata === 'object'
          ? (jsonConfig.metadata as Record<string, Record<string, string[]>>)
          : {};

      // Match metadata rules
      const matched = new Set<string>();
      const matchedRules: string[] = [];
      let fallbackUsed = false;

      for (const [key, mapping] of Object.entries(metadata)) {
        const reqVal = requestMetadata[key];
        if (reqVal === undefined || reqVal === null) continue;

        const reqVals = Array.isArray(reqVal)
          ? reqVal.map((v) => String(v))
          : [String(reqVal)];

        for (const val of reqVals) {
          const models = mapping[val];
          if (Array.isArray(models)) {
            matchedRules.push(`${key}:${val}`);
            for (const m of models) {
              if (m && typeof m === 'string') {
                matched.add(String(m));
              }
            }
          }
        }
      }

      allowedSet = Array.from(matched);
      if (allowedSet.length === 0) {
        allowedSet = defaults;
        fallbackUsed = true;
      }

      // Store additional metadata for debugging
      data = {
        verdict: false, // Will be set later
        not,
        mode: 'json',
        matchedMetadata: requestMetadata,
        explanation: '', // Will be set later
        requestedModel: requestModel,
        allowedModels: allowedSet,
        matchedRules,
        fallbackUsed,
      };

      mode = 'json';
    } else if (Array.isArray(modelList)) {
      // Use legacy models list
      allowedSet = modelList.map(String).filter(Boolean);
      mode = 'default';
    }

    if (!Array.isArray(allowedSet) || allowedSet.length === 0) {
      throw new Error('Missing allowed models configuration');
    }

    const inList = allowedSet.includes(requestModel);
    verdict = not ? !inList : inList;

    let explanation = '';
    if (verdict) {
      if (not) {
        explanation = `Model "${requestModel}" is not in the allowed list as expected.`;
      } else {
        explanation = `Model "${requestModel}" is allowed.`;
        if (mode === 'json' && data?.matchedRules?.length) {
          explanation += ` (matched rules: ${data.matchedRules.join(', ')})`;
        } else if (mode === 'json' && data?.fallbackUsed) {
          explanation += ' (using default models)';
        }
      }
    } else {
      if (not) {
        explanation = `Model "${requestModel}" is in the allowed list when it should not be.`;
      } else {
        explanation = `Model "${requestModel}" is not in the allowed list.`;
        if (mode === 'json' && allowedSet.length > 0) {
          explanation += ` Available models: ${allowedSet.slice(0, 5).join(', ')}${allowedSet.length > 5 ? '...' : ''}`;
        }
      }
    }

    // Update or create data object
    if (data) {
      data.verdict = verdict;
      data.explanation = explanation;
    } else {
      data = {
        verdict,
        not,
        mode,
        matchedMetadata: requestMetadata,
        explanation,
        requestedModel: requestModel,
        allowedModels: allowedSet,
      };
    }
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
