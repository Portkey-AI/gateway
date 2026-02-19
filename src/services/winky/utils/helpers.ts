import { AnalyticsLogObjectV2 } from '../../../middlewares/portkey/types';
import { Environment } from '../../../utils/env';
import {
  externalServiceFetch,
  internalServiceFetch,
} from '../../../utils/fetch';
import Providers from '../../../providers/index';
import {
  HOOKS_CREDENTIALS_SENSITIVE_FIELDS,
  SENSITIVE_CONFIG_FIELDS,
} from './constants';
import { DefaultLogConfig } from '../../../providers/open-ai-base/pricing';
import { LogConfig } from '../../../providers/types';

export function getProviderLogConfig(provider: string): LogConfig {
  return Providers[provider]?.pricing || DefaultLogConfig;
}

export const hash = (string: string | null | undefined) => {
  if (string === null || string === undefined) return null;
  //remove bearer from the string
  if (string.startsWith('Bearer ')) string = string.slice(7, string.length);
  return (
    string.slice(0, 2) +
    '********' +
    string.slice(string.length - 3, string.length)
  );
};

export function maskHookSensitiveFields(hooks: any[]) {
  if (!hooks?.length) return;

  hooks.forEach((hook: any) => {
    if (!hook || typeof hook !== 'object') return;

    // Handle long form hooks
    if (hook.checks?.length) {
      hook.checks.forEach((check: any) => {
        HOOKS_CREDENTIALS_SENSITIVE_FIELDS.forEach((field) => {
          if (check.parameters?.credentials?.[field]) {
            check.parameters.credentials[field] = hash(
              check.parameters.credentials[field]
            );
          }
        });
        if (
          check.parameters?.headers &&
          typeof check.parameters.headers === 'object'
        ) {
          Object.keys(check.parameters.headers).forEach((header) => {
            check.parameters.headers[header] = hash(
              check.parameters.headers[header]
            );
          });
        }
      });
      return;
    }

    // Handle shorthand hooks
    if (!hook?.checks) {
      Object.keys(hook).forEach((key) => {
        if (hook[key]?.credentials) {
          HOOKS_CREDENTIALS_SENSITIVE_FIELDS.forEach((field) => {
            if (hook[key].credentials[field]) {
              hook[key].credentials[field] = hash(hook[key].credentials[field]);
            }
          });
          if (hook[key]?.headers && typeof hook[key].headers === 'object') {
            Object.keys(hook[key].headers).forEach((header) => {
              hook[key].headers[header] = hash(hook[key].headers[header]);
            });
          }
        }
      });
    }
  });
}

export function maskNestedConfig(
  config: Record<string, any>,
  nestingKey: string
) {
  SENSITIVE_CONFIG_FIELDS.forEach((field) => {
    if (config[field]) {
      config[field] =
        typeof config[field] === 'object'
          ? hash(JSON.stringify(config[field]))
          : hash(config[field]);
    }
  });

  maskHookSensitiveFields(config['before_request_hooks']);
  maskHookSensitiveFields(config['after_request_hooks']);
  maskHookSensitiveFields(config['input_guardrails']);
  maskHookSensitiveFields(config['output_guardrails']);

  if (config[nestingKey]) {
    for (const [, target] of config[nestingKey].entries()) {
      maskNestedConfig(target, nestingKey);
    }
  }
}

export async function retriableApiReq(
  env: Record<string, any>,
  url: string,
  options: RequestInit,
  attempt: number = 5,
  externalFetch: boolean = true
) {
  return retryUntil(
    env,
    () =>
      externalFetch
        ? externalServiceFetch(url, options)
        : internalServiceFetch(url, options),
    (response) => {
      return response.ok;
    },
    (response) => {
      return response.text();
    },
    attempt,
    100
  );
}

export async function retryUntil<T>(
  env: Record<string, any>,
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  errFunc: (res: T) => Promise<string>,
  maxRetries: number,
  baseDelayMs: number
): Promise<T> {
  const retry = async (attempt: number): Promise<T> => {
    try {
      const result = await fn();
      if (condition(result)) {
        return result;
      } else if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempt++;
        return retry(attempt);
      } else {
        const errorMessage = await errFunc(result);
        throw new Error(`Error ${errorMessage}`);
      }
    } catch (error) {
      attempt++;
      if (attempt < maxRetries) {
        return retry(attempt);
      }
      throw new Error(`Retry failed: ${error}`);
    }
  };
  return retry(0);
}

export const constructAnalyticsObject = (logObject: Record<string, any>) => {
  const analyticsObject: Record<string, any> = {};
  for (const key in logObject) {
    if (
      !logObject[key].isNullable &&
      (logObject[key].value === null || logObject[key].value === undefined)
    ) {
      if (logObject[key].type === 'string') analyticsObject[key] = '';
      if (logObject[key].type === 'int' || logObject[key].type === 'float')
        analyticsObject[key] = 0;
    }
    if (logObject[key].value !== null && logObject[key].value !== undefined) {
      if (logObject[key].type === 'string') {
        analyticsObject[key] = logObject[key].value.toString();
      } else {
        analyticsObject[key] = logObject[key].value;
      }
    }
  }
  return analyticsObject;
};

export function generateMetricObject(
  chLogObject: Record<string, any>
): Record<string, any> {
  const analyticsObject = constructAnalyticsObject(
    chLogObject
  ) as AnalyticsLogObjectV2;
  return analyticsObject;
}

export function getURL(url: string, basePath: string) {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    urlObj = new URL(url, basePath || 'https://api.openai.com');
  }
  return urlObj.toString();
}

export function removeSpecialChars(
  obj: Record<string, any>
): Record<string, any> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeSpecialChars);
  }

  return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
    const newKey = key.replace(/[$.]/g, '__');
    const value = obj[key];

    if (
      typeof value === 'object' &&
      !(value instanceof Date) &&
      value !== null
    ) {
      acc[newKey] = removeSpecialChars(value);
    } else {
      acc[newKey] = value;
    }

    return acc;
  }, {});
}

export const getLogFilePathFormat = (env: Record<string, any>): string => {
  const VALID_PATH_FORMATS = ['v1', 'v2'] as const;
  const format = Environment(env).LOG_STORE_FILE_PATH_FORMAT;

  return VALID_PATH_FORMATS.includes(format) ? format : 'v1';
};

export function getLogFilePath(
  env: Record<string, any>,
  retentionPeriod: number,
  orgId: string,
  workspaceSlug: string | null | undefined,
  createdAt: string | null,
  logId: string,
  _pathFormat?: string | null,
  subDirectory?: string | null // Optional subdirectory like 'hooks', 'traces', etc.
): { filePath: string; pathFormat: string } {
  const pathFormat = _pathFormat || getLogFilePathFormat(env);
  const subDir = subDirectory ? `${subDirectory}/` : '';
  switch (pathFormat) {
    case 'v2': {
      // v2 format: 30/org-id/ws-id/year/month/day/hour/[subdir/]logId.json
      if (!createdAt) {
        throw new Error('createdAt is required for v2 path format');
      }

      // createdAt is in the format of 2025-01-01 00:00:00.000
      const year = createdAt.slice(0, 4);
      const month = createdAt.slice(5, 7);
      const day = createdAt.slice(8, 10);
      const hour = createdAt.slice(11, 13);
      const timePrefix = `${year}/${month}/${day}/${hour}`;

      return {
        filePath: `${retentionPeriod}/${orgId}/${workspaceSlug}/${timePrefix}/${subDir}${logId}.json`,
        pathFormat: 'v2',
      };
    }

    case 'v1':
    default:
      // v1 format (default): 30/org-id/[subdir/]logId.json
      return {
        filePath: `${retentionPeriod}/${orgId}/${subDir}${logId}.json`,
        pathFormat: 'v1',
      };
  }
}
