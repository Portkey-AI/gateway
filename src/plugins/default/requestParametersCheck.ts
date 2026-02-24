import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

interface Tool {
  type: string;
  function?: { name: string };
  name?: string;
}

type ToolBlockReason =
  | 'type_blocked'
  | 'name_blocked'
  | 'type_not_allowed'
  | 'name_not_allowed';

type ParamBlockReason =
  | 'key_blocked'
  | 'key_not_allowed'
  | 'value_blocked'
  | 'value_not_allowed';

interface BlockedToolInfo {
  type: string;
  name: string;
  reasons: ToolBlockReason[];
}

interface BlockedParamInfo {
  param: string;
  value?: unknown;
  reasons: ParamBlockReason[];
}

interface ToolInfo {
  type: string;
  name: string;
}

interface ToolsConfig {
  blockedTypes?: string[];
  allowedTypes?: string[];
  blockedFunctionNames?: string[];
  allowedFunctionNames?: string[];
}

interface ParamValueConfig {
  blockedValues?: (string | number | boolean)[];
  allowedValues?: (string | number | boolean)[];
}

interface ParamsConfig {
  blockedKeys?: string[];
  allowedKeys?: string[];
  values?: Record<string, ParamValueConfig>;
}

const toArray = <T>(arr: T[] | undefined | null): T[] =>
  Array.isArray(arr) ? arr : [];

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;

  if (eventType !== 'beforeRequestHook') {
    return {
      error: { message: 'This plugin only works for before_request_hooks' },
      verdict,
      data: null,
    };
  }

  try {
    const requestJson = context.request?.json || {};

    const toolsConfig: ToolsConfig = parameters.tools || {};
    const paramsConfig: ParamsConfig = parameters.params || {};

    const blockedTypes = toArray(toolsConfig.blockedTypes);
    const allowedTypes = toArray(toolsConfig.allowedTypes);
    const blockedFunctionNames = toArray(toolsConfig.blockedFunctionNames);
    const allowedFunctionNames = toArray(toolsConfig.allowedFunctionNames);

    const blockedKeys = toArray(paramsConfig.blockedKeys);
    const allowedKeys = toArray(paramsConfig.allowedKeys);
    const paramValues = paramsConfig.values || {};

    if (blockedTypes.length && allowedTypes.length) {
      const conflicts = blockedTypes.filter((type) =>
        allowedTypes.includes(type)
      );
      if (conflicts.length > 0) {
        throw new Error(
          `Tools config conflict: Types in both blocked and allowed lists: ${conflicts.join(', ')}`
        );
      }
    }

    if (blockedFunctionNames.length && allowedFunctionNames.length) {
      const conflicts = blockedFunctionNames.filter((name) =>
        allowedFunctionNames.includes(name)
      );
      if (conflicts.length > 0) {
        throw new Error(
          `Tools config conflict: Function names in both blocked and allowed lists: ${conflicts.join(', ')}`
        );
      }
    }

    if (blockedKeys.length && allowedKeys.length) {
      const conflicts = blockedKeys.filter((key) => allowedKeys.includes(key));
      if (conflicts.length > 0) {
        throw new Error(
          `Params config conflict: Keys in both blocked and allowed lists: ${conflicts.join(', ')}`
        );
      }
    }

    for (const [paramName, valueConfig] of Object.entries(paramValues)) {
      const blockedVals = toArray(valueConfig.blockedValues);
      const allowedVals = toArray(valueConfig.allowedValues);
      if (blockedVals.length && allowedVals.length) {
        const conflicts = blockedVals.filter((v) => allowedVals.includes(v));
        if (conflicts.length > 0) {
          throw new Error(
            `Params config conflict: Values for "${paramName}" in both blocked and allowed lists: ${conflicts.join(', ')}`
          );
        }
      }
    }

    const tools: Tool[] = toArray(requestJson.tools);
    const blockedToolsFound: BlockedToolInfo[] = [];
    const toolsInRequest: ToolInfo[] = [];

    const hasToolsConfig =
      blockedTypes.length ||
      allowedTypes.length ||
      blockedFunctionNames.length ||
      allowedFunctionNames.length;

    if (hasToolsConfig && tools.length) {
      for (const tool of tools) {
        const toolType = tool.type || 'unknown';
        const functionName = tool.function?.name || tool.name || toolType;
        toolsInRequest.push({ type: toolType, name: functionName });

        const reasons: ToolBlockReason[] = [];

        if (blockedTypes.length && blockedTypes.includes(toolType)) {
          reasons.push('type_blocked');
        }

        if (
          blockedFunctionNames.length &&
          blockedFunctionNames.includes(functionName)
        ) {
          reasons.push('name_blocked');
        }

        if (allowedTypes.length && !allowedTypes.includes(toolType)) {
          reasons.push('type_not_allowed');
        }

        if (
          allowedFunctionNames.length &&
          !allowedFunctionNames.includes(functionName)
        ) {
          reasons.push('name_not_allowed');
        }

        if (reasons.length > 0) {
          blockedToolsFound.push({
            type: toolType,
            name: functionName,
            reasons,
          });
        }
      }
    }

    const blockedParamsFound: BlockedParamInfo[] = [];
    const requestKeys = Object.keys(requestJson);

    const hasParamsConfig =
      blockedKeys.length ||
      allowedKeys.length ||
      Object.keys(paramValues).length;

    if (hasParamsConfig) {
      for (const key of requestKeys) {
        const value = requestJson[key];
        const reasons: ParamBlockReason[] = [];

        // Check blocked keys
        if (blockedKeys.length && blockedKeys.includes(key)) {
          reasons.push('key_blocked');
        }

        // Check allowed keys (if specified, key must be in list)
        if (allowedKeys.length && !allowedKeys.includes(key)) {
          reasons.push('key_not_allowed');
        }

        // Check value constraints
        const valueConfig = paramValues[key];
        if (valueConfig) {
          const blockedVals = toArray(valueConfig.blockedValues);
          const allowedVals = toArray(valueConfig.allowedValues);

          if (blockedVals.length && blockedVals.includes(value)) {
            reasons.push('value_blocked');
          }

          if (allowedVals.length && !allowedVals.includes(value)) {
            reasons.push('value_not_allowed');
          }
        }

        if (reasons.length > 0) {
          blockedParamsFound.push({ param: key, value, reasons });
        }
      }
    }

    verdict = blockedToolsFound.length === 0 && blockedParamsFound.length === 0;

    const explanationParts: string[] = [];

    if (blockedToolsFound.length > 0) {
      const toolReasonDescriptions: Record<ToolBlockReason, string> = {
        type_blocked: 'type is blocked',
        name_blocked: 'function name is blocked',
        type_not_allowed: 'type is not in allowed list',
        name_not_allowed: 'function name is not in allowed list',
      };

      const toolDescriptions = blockedToolsFound.map((t) => {
        const reasonTexts = t.reasons.map((r) => toolReasonDescriptions[r]);
        return `"${t.name}" (${reasonTexts.join(', ')})`;
      });
      explanationParts.push(`Blocked tools: ${toolDescriptions.join('; ')}`);
    }

    if (blockedParamsFound.length > 0) {
      const paramReasonDescriptions: Record<ParamBlockReason, string> = {
        key_blocked: 'key is blocked',
        key_not_allowed: 'key is not in allowed list',
        value_blocked: 'value is blocked',
        value_not_allowed: 'value is not in allowed list',
      };

      const paramDescriptions = blockedParamsFound.map((p) => {
        const reasonTexts = p.reasons.map((r) => paramReasonDescriptions[r]);
        const valueStr =
          p.value !== undefined ? `=${JSON.stringify(p.value)}` : '';
        return `"${p.param}"${valueStr} (${reasonTexts.join(', ')})`;
      });
      explanationParts.push(`Blocked params: ${paramDescriptions.join('; ')}`);
    }

    const explanation =
      explanationParts.length > 0
        ? explanationParts.join('. ')
        : 'All checks passed.';

    const data = {
      toolsInRequest: toolsInRequest.length > 0 ? toolsInRequest : undefined,
      blockedToolsFound:
        blockedToolsFound.length > 0 ? blockedToolsFound : undefined,
      blockedParamsFound:
        blockedParamsFound.length > 0 ? blockedParamsFound : undefined,
      explanation,
      config: {
        tools: hasToolsConfig
          ? {
              blockedTypes: blockedTypes.length ? blockedTypes : undefined,
              allowedTypes: allowedTypes.length ? allowedTypes : undefined,
              blockedFunctionNames: blockedFunctionNames.length
                ? blockedFunctionNames
                : undefined,
              allowedFunctionNames: allowedFunctionNames.length
                ? allowedFunctionNames
                : undefined,
            }
          : undefined,
        params: hasParamsConfig
          ? {
              blockedKeys: blockedKeys.length ? blockedKeys : undefined,
              allowedKeys: allowedKeys.length ? allowedKeys : undefined,
              values:
                Object.keys(paramValues).length > 0 ? paramValues : undefined,
            }
          : undefined,
      },
    };

    return { error, verdict, data };
  } catch (e: unknown) {
    error = e as Error;
    return {
      error,
      verdict: true,
      data: { explanation: `An error occurred: ${error.message}` },
    };
  }
};
