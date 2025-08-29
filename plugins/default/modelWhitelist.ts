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
    const rulesConfig = parameters.rules as Record<string, unknown> | undefined;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    let allowedSet: string[] = [];
    let mode: 'rules' | 'default' = 'default';
    const matchedRules: string[] = [];
    let fallbackUsed = false;

    // Check if rules configuration is provided
    if (rulesConfig && typeof rulesConfig === 'object') {
      const defaults = Array.isArray(rulesConfig.defaults)
        ? rulesConfig.defaults.map(String)
        : [];
      const metadata =
        rulesConfig.metadata && typeof rulesConfig.metadata === 'object'
          ? (rulesConfig.metadata as Record<string, Record<string, string[]>>)
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

      mode = 'rules';
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
        if (mode === 'rules' && matchedRules.length) {
          explanation += ` (matched rules: ${matchedRules.join(', ')})`;
        } else if (mode === 'rules' && fallbackUsed) {
          explanation += ' (using default models)';
        }
      }
    } else {
      if (not) {
        explanation = `Model "${requestModel}" is in the allowed list when it should not be.`;
      } else {
        explanation = `Model "${requestModel}" is not in the allowed list.`;
      }
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
