import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

type ToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
};

type Finding = {
  toolName: string;
  toolCallId?: string;
  path?: string;
  reason: string;
  valuePreview?: string;
};

type FlatLeaf = {
  path: string;
  value: unknown;
};

const DEFAULT_MAX_STRING_LENGTH = 4096;
const DEFAULT_MAX_ARRAY_ITEMS = 100;
const PREVIEW_LIMIT = 160;

const normalizeStringArray = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

const preview = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > PREVIEW_LIMIT
    ? `${text.slice(0, PREVIEW_LIMIT)}...`
    : text;
};

const parseArguments = (
  args: string | Record<string, unknown> | undefined
): unknown => {
  if (!args) {
    return {};
  }

  if (typeof args === 'string') {
    return JSON.parse(args);
  }

  return args;
};

const flatten = (value: unknown, basePath = ''): FlatLeaf[] => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ path: basePath, value }];
    }

    return value.flatMap((item, index) =>
      flatten(item, basePath ? `${basePath}.${index}` : String(index))
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [{ path: basePath, value }];
    }

    return entries.flatMap(([key, nestedValue]) =>
      flatten(nestedValue, basePath ? `${basePath}.${key}` : key)
    );
  }

  return [{ path: basePath, value }];
};

const pathMatches = (path: string, pattern: string): boolean => {
  const pathParts = path.split('.');
  const patternParts = pattern.split('.');

  if (pathParts.length !== patternParts.length) {
    return false;
  }

  return patternParts.every(
    (part, index) => part === '*' || part === pathParts[index]
  );
};

const getArrayViolations = (
  value: unknown,
  maxArrayItems: number,
  basePath = ''
): FlatLeaf[] => {
  if (Array.isArray(value)) {
    const current =
      value.length > maxArrayItems ? [{ path: basePath, value }] : [];
    return [
      ...current,
      ...value.flatMap((item, index) =>
        getArrayViolations(
          item,
          maxArrayItems,
          basePath ? `${basePath}.${index}` : String(index)
        )
      ),
    ];
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) =>
        getArrayViolations(
          item,
          maxArrayItems,
          basePath ? `${basePath}.${key}` : key
        )
    );
  }

  return [];
};

const extractToolCalls = (
  context: PluginContext,
  eventType: HookEventType
): ToolCall[] => {
  const target =
    eventType === 'beforeRequestHook' ? context.request : context.response;
  const json = target?.json;

  if (!json) {
    return [];
  }

  if (eventType === 'afterRequestHook') {
    return (json.choices || []).flatMap(
      (choice: any) => choice?.message?.tool_calls || []
    );
  }

  return (json.messages || []).flatMap(
    (message: any) => message?.tool_calls || []
  );
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  const blockedPaths = normalizeStringArray(parameters.blockedPaths);
  const allowedToolNames = normalizeStringArray(parameters.allowedToolNames);
  const maxStringLength =
    typeof parameters.maxStringLength === 'number'
      ? parameters.maxStringLength
      : DEFAULT_MAX_STRING_LENGTH;
  const maxArrayItems =
    typeof parameters.maxArrayItems === 'number'
      ? parameters.maxArrayItems
      : DEFAULT_MAX_ARRAY_ITEMS;

  const findings: Finding[] = [];
  const toolCalls = extractToolCalls(context, eventType);

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name || 'unknown';

    if (allowedToolNames.length && !allowedToolNames.includes(toolName)) {
      findings.push({
        toolName,
        toolCallId: toolCall.id,
        reason: 'tool_name_not_allowed',
      });
    }

    let args: unknown;
    try {
      args = parseArguments(toolCall.function?.arguments);
    } catch (error) {
      findings.push({
        toolName,
        toolCallId: toolCall.id,
        reason: 'invalid_json_arguments',
        valuePreview: preview(toolCall.function?.arguments || ''),
      });
      continue;
    }

    for (const leaf of flatten(args)) {
      if (blockedPaths.some((pattern) => pathMatches(leaf.path, pattern))) {
        findings.push({
          toolName,
          toolCallId: toolCall.id,
          path: leaf.path,
          reason: 'blocked_path',
          valuePreview: preview(leaf.value),
        });
      }

      if (
        typeof leaf.value === 'string' &&
        leaf.value.length > maxStringLength
      ) {
        findings.push({
          toolName,
          toolCallId: toolCall.id,
          path: leaf.path,
          reason: 'string_too_long',
          valuePreview: preview(leaf.value),
        });
      }
    }

    for (const violation of getArrayViolations(args, maxArrayItems)) {
      findings.push({
        toolName,
        toolCallId: toolCall.id,
        path: violation.path,
        reason: 'array_too_large',
        valuePreview: preview(violation.value),
      });
    }
  }

  return {
    error: null,
    verdict: findings.length === 0,
    data: {
      toolCallCount: toolCalls.length,
      findings,
    },
  };
};
