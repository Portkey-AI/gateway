import { PolicyContext, PolicyConditionKey } from '../types';

export interface PolicyCondition {
  key: PolicyConditionKey;
  value?: string | string[];
  excludes?: string | string[];
}

export interface PolicyGroupBy {
  key: PolicyConditionKey;
}

export function normalizeToArray(
  value: string | string[] | undefined
): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function matchesPattern(pattern: string, value: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // Remove the '*', keep '@provider/'
    return value.startsWith(prefix);
  }
  return pattern === value;
}

export function extractValueFromContext(
  key: string,
  context: PolicyContext
): string | null {
  if (key === 'api_key') {
    return context.apiKeyId;
  }

  if (key.startsWith('metadata.')) {
    const metadataKey = key.substring('metadata.'.length);
    return context.metadata?.[metadataKey] || null;
  }

  if (key === 'organisation_id') {
    return context.organisationId;
  }

  if (key === 'workspace_id') {
    return context.workspaceId;
  }

  if (key === 'virtual_key') {
    return context.virtualKeySlug || null;
  }

  if (key === 'provider') {
    return context.providerSlug || null;
  }

  if (key === 'config') {
    return context.configSlug || null;
  }

  if (key === 'prompt') {
    return context.promptSlug || null;
  }

  if (key === 'model') {
    if (context.model && context.providerSlug) {
      return `@${context.providerSlug}/${context.model}`;
    }
    return null;
  }

  return null;
}

export function extractValueForGroupBy(
  key: string,
  context: PolicyContext
): string | null {
  if (key === 'virtual_key') {
    return context.virtualKeyId || null;
  }
  if (key === 'provider') {
    return context.providerSlug || null;
  }
  if (key === 'config') {
    return context.configId || null;
  }
  if (key === 'prompt') {
    return context.promptId || null;
  }
  if (key === 'model') {
    if (context.model && context.providerSlug) {
      return `${context.providerSlug}.${context.model}`;
    }
    return null;
  }
  return extractValueFromContext(key, context);
}

export function checkConditionsMatch(
  conditions: PolicyCondition[],
  context: PolicyContext
): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  for (const condition of conditions) {
    const extractedValue = extractValueFromContext(condition.key, context);

    if (extractedValue === null) {
      return false;
    }

    if (condition.excludes) {
      const excludeValues = normalizeToArray(condition.excludes);
      if (condition.key === 'model') {
        const isExcluded = excludeValues.some((pattern) =>
          matchesPattern(pattern, extractedValue)
        );
        if (isExcluded) {
          return false;
        }
      } else if (excludeValues.includes(extractedValue)) {
        return false;
      }
    }

    if (condition.value) {
      if (condition.value === '*') {
        continue;
      }

      const allowedValues = normalizeToArray(condition.value);

      if (condition.key === 'model') {
        const isMatch = allowedValues.some((pattern) =>
          matchesPattern(pattern, extractedValue)
        );
        if (!isMatch) {
          return false;
        }
      } else if (!allowedValues.includes(extractedValue)) {
        return false;
      }
    }
  }

  return true;
}

export function generateValuesKey(
  groupBy: PolicyGroupBy[],
  context: PolicyContext
): string | null {
  if (!groupBy || groupBy.length === 0) {
    return 'default';
  }

  const valueParts: string[] = [];

  for (const group of groupBy) {
    const extractedValue = extractValueForGroupBy(group.key, context);

    if (extractedValue === null) {
      return null;
    }

    valueParts.push(`${group.key}:${extractedValue}`);
  }

  return valueParts.join('-');
}
