import type {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

type AnyTool = Record<string, unknown>;

function normalizeFunctionTool(tool: AnyTool): AnyTool | null {
  if (!tool || typeof tool !== 'object') return null;
  if (tool.type !== 'function') return tool;

  // If already in expected shape, return as-is
  if (tool.function && typeof tool.function === 'object') {
    return tool;
  }

  // Convert flattened shape -> nested { function: { ... } }
  const { name, description, parameters, strict, ...rest } = tool as AnyTool;
  if (!name) return null;
  const converted: AnyTool = {
    type: 'function',
    function: { name, description, parameters, strict },
    ...rest,
  };
  return converted;
}

function dedupeTools(existing: AnyTool[], incoming: AnyTool[]): AnyTool[] {
  const seen = new Set<string>();
  const pickKey = (t: AnyTool) =>
    t?.type === 'function' && t?.function?.name
      ? `function::${t.function.name}`
      : JSON.stringify({ t: t?.type, n: t?.name });

  const out: AnyTool[] = [];
  for (const t of [...existing, ...incoming]) {
    const key = pickKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error: unknown = null;
  const verdict = true;
  let data = null;
  const transformedData: {
    request: { json: unknown | null };
    response: { json: unknown | null };
  } = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  try {
    if (eventType !== 'beforeRequestHook') {
      return { error, verdict, data, transformedData, transformed };
    }

    if (!context?.request?.json) {
      return {
        error: { message: 'Request JSON is empty or missing' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    // Only operate for chatComplete or messages (skip embed/complete)
    if (!['chatComplete', 'messages'].includes(context.requestType || '')) {
      return { error, verdict, data, transformedData, transformed };
    }

    const incomingToolsParam = parameters?.tools;
    if (!incomingToolsParam) {
      return {
        error: { message: 'Parameter "tools" is required' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const replaceExisting = parameters?.replaceExisting === true;
    const dedupeByName = parameters?.dedupeByName !== false; // default true

    const incomingArray: AnyTool[] = Array.isArray(incomingToolsParam)
      ? incomingToolsParam
      : [incomingToolsParam];

    // Normalize tools to expected internal shape
    const normalizedIncoming: AnyTool[] = incomingArray
      .map((t) => normalizeFunctionTool(t))
      .filter(Boolean) as AnyTool[];

    const originalJson = context.request.json;
    const updatedJson = { ...originalJson };
    const existingTools: AnyTool[] = Array.isArray(originalJson.tools)
      ? [...originalJson.tools]
      : [];

    let nextTools: AnyTool[] = replaceExisting
      ? normalizedIncoming
      : [...existingTools, ...normalizedIncoming];

    if (dedupeByName) {
      nextTools = dedupeTools([], nextTools);
    }

    updatedJson.tools = nextTools;

    // Optional: simplified tool_choice presets
    const preset = (parameters as Record<string, unknown>)?.toolChoicePreset as
      | 'add_any'
      | 'add_all'
      | 'auto'
      | 'none'
      | undefined;
    const resetToolChoice =
      (parameters as Record<string, unknown>)?.resetToolChoice === true;
    const requiredFunctionName = (parameters as Record<string, unknown>)
      ?.requiredFunctionName as string | undefined;

    const hasExistingToolChoice =
      (originalJson as Record<string, unknown>)?.tool_choice !== undefined &&
      (originalJson as Record<string, unknown>)?.tool_choice !== null;

    const shouldApplyPreset = resetToolChoice || !hasExistingToolChoice;
    if (shouldApplyPreset && preset) {
      let finalChoice: unknown = undefined;
      if (preset === 'auto') {
        finalChoice = 'auto';
      } else if (preset === 'none') {
        finalChoice = 'none';
      } else if (preset === 'add_any' || preset === 'add_all') {
        if (requiredFunctionName) {
          // Enforce a specific function
          const exists = nextTools.some(
            (t) =>
              t &&
              (t as { type?: unknown; function?: { name?: unknown } }).type ===
                'function' &&
              (t as { function?: { name?: unknown } }).function?.name ===
                requiredFunctionName
          );
          if (exists) {
            finalChoice = {
              type: 'function',
              function: { name: requiredFunctionName },
            };
          } else {
            // Fall back to required if specified function not present
            finalChoice = 'required';
          }
        } else {
          // Require at least one tool call; providers decide which
          finalChoice = 'required';
        }
      }

      if (finalChoice !== undefined) {
        (updatedJson as Record<string, unknown>).tool_choice = finalChoice;
      }
    }

    transformedData.request.json = updatedJson;
    transformed = true;
    data = {
      injectedCount: normalizedIncoming.length,
      totalTools: nextTools.length,
    };
  } catch (e: unknown) {
    error = e instanceof Error ? { message: e.message } : e;
  }

  return { error, verdict, data, transformedData, transformed };
};

export default handler;
