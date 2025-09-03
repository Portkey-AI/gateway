import type {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

interface RulesData {
  explanation: string;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: RulesData | null = null;

  try {
    const rulesConfig = parameters.rules as Record<string, unknown> | undefined;
    const not = parameters.not || false;
    const requestModel = context.request?.json.model as string | undefined;
    const requestMetadata: Record<string, unknown> = context?.metadata || {};

    if (!requestModel) {
      throw new Error('Missing model in request');
    }

    if (!rulesConfig || typeof rulesConfig !== 'object') {
      throw new Error('Missing rules configuration');
    }

    type RulesShape = {
      defaults?: unknown;
      metadata?: unknown;
    };
    const cfg = rulesConfig as RulesShape;

    const defaultsArray = Array.isArray(cfg.defaults)
      ? (cfg.defaults as unknown[])
      : [];
    const defaults = defaultsArray.map((m) => String(m));

    const metadata =
      cfg.metadata && typeof cfg.metadata === 'object'
        ? (cfg.metadata as Record<string, Record<string, unknown>>)
        : {};

    const matched = new Set<string>();
    const matchedRules: string[] = [];

    for (const [key, mapping] of Object.entries(metadata)) {
      const reqVal = requestMetadata[key];
      if (reqVal === undefined || reqVal === null) continue;

      const reqVals = Array.isArray(reqVal)
        ? reqVal.map((v) => String(v))
        : [String(reqVal)];

      for (const val of reqVals) {
        const modelsUnknown = (mapping as Record<string, unknown>)[val];
        if (Array.isArray(modelsUnknown)) {
          const models = (modelsUnknown as unknown[]).filter(
            (m) => typeof m === 'string'
          ) as string[];
          matchedRules.push(`${key}:${val}`);
          for (const m of models) {
            if (m && typeof m === 'string') {
              matched.add(String(m));
            }
          }
        }
      }
    }

    let allowedSet = Array.from(matched);
    let usingDefaults = false;
    if (allowedSet.length === 0) {
      allowedSet = defaults;
      usingDefaults = true;
    }

    if (!Array.isArray(allowedSet) || allowedSet.length === 0) {
      throw new Error('No allowed models resolved from rules');
    }

    const inList = allowedSet.includes(requestModel);
    verdict = not ? !inList : inList;

    let explanation = '';
    if (verdict) {
      explanation = not
        ? `Model "${requestModel}" is not permitted by rules (blocked list).`
        : `Model "${requestModel}" is allowed by rules.`;
      if (matchedRules.length) {
        explanation += ` (matched rules: ${matchedRules.join(', ')})`;
      } else if (usingDefaults) {
        explanation += ' (using default models)';
      }
    } else {
      explanation = not
        ? `Model "${requestModel}" is permitted by rules (in blocked list).`
        : `Model "${requestModel}" is not allowed by rules.`;
    }

    data = { explanation };
  } catch (e) {
    const err = e as Error;
    error = err;
    data = {
      explanation: `An error occurred while checking model rules: ${err.message}`,
    };
  }

  return { error, verdict, data };
};
