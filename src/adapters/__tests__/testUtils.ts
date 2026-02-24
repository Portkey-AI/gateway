/**
 * Shared test utilities for adapter tests
 */

import { ProviderConfig } from '../../providers/types';
import { Params, Options } from '../../types/requestBody';

/**
 * Set a nested property on an object using dot notation path
 */
export function setNestedProperty(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Transform request params using a provider configuration
 * Simulates the transformation that happens in the gateway's request pipeline
 */
export function transformUsingProviderConfig(
  providerConfig: ProviderConfig,
  params: Params,
  providerOptions?: Options
): { [key: string]: any } {
  const transformedRequest: { [key: string]: any } = {};

  for (const configParam in providerConfig) {
    let paramConfigs = providerConfig[configParam];
    if (!Array.isArray(paramConfigs)) {
      paramConfigs = [paramConfigs];
    }

    for (const paramConfig of paramConfigs) {
      if (configParam in params) {
        let value = params[configParam as keyof typeof params];

        if (paramConfig.transform) {
          value = paramConfig.transform(params, providerOptions as any);
        }

        if (value === 'portkey-default' && paramConfig?.default !== undefined) {
          value = paramConfig.default;
        }

        if (
          typeof value === 'number' &&
          paramConfig?.min !== undefined &&
          value < paramConfig.min
        ) {
          value = paramConfig.min;
        } else if (
          typeof value === 'number' &&
          paramConfig?.max !== undefined &&
          value > paramConfig.max
        ) {
          value = paramConfig.max;
        }

        setNestedProperty(
          transformedRequest,
          paramConfig?.param as string,
          value
        );
      } else if (paramConfig?.required && paramConfig.default !== undefined) {
        const value =
          typeof paramConfig.default === 'function'
            ? paramConfig.default(params, providerOptions)
            : paramConfig.default;
        setNestedProperty(transformedRequest, paramConfig.param, value);
      }
    }
  }

  return transformedRequest;
}
