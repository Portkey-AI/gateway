import { GatewayError } from '../errors/GatewayError';
import { MULTIPART_FORM_DATA_ENDPOINTS } from '../globals';
import ProviderConfigs from '../providers';
import { endpointStrings, ProviderConfig } from '../providers/types';
import { Options, Params, Targets } from '../types/requestBody';

/**
 * Helper function to set a nested property in an object.
 *
 * @param obj - The object on which to set the property.
 * @param path - The dot-separated path to the property.
 * @param value - The value to set the property to.
 */
function setNestedProperty(obj: any, path: string, value: any) {
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

const getValue = (configParam: string, params: Params, paramConfig: any) => {
  let value = params[configParam as keyof typeof params];

  // If a transformation is defined for this parameter, apply it
  if (paramConfig.transform) {
    value = paramConfig.transform(params);
  }

  if (
    value === 'portkey-default' &&
    paramConfig &&
    paramConfig.default !== undefined
  ) {
    // Set the transformed parameter to the default value
    value = paramConfig.default;
  }

  // If a minimum is defined for this parameter and the value is less than this, set the value to the minimum
  // Also, we should only do this comparison if value is of type 'number'
  if (
    typeof value === 'number' &&
    paramConfig &&
    paramConfig.min !== undefined &&
    value < paramConfig.min
  ) {
    value = paramConfig.min;
  }

  // If a maximum is defined for this parameter and the value is more than this, set the value to the maximum
  // Also, we should only do this comparison if value is of type 'number'
  else if (
    typeof value === 'number' &&
    paramConfig &&
    paramConfig.max !== undefined &&
    value > paramConfig.max
  ) {
    value = paramConfig.max;
  }

  return value;
};

/**
 * Transforms the request body to match the structure required by the AI provider.
 *
 * First, for each parameter in the request body:
 *    - If a corresponding config is present for the parameter, the value is transformed using the transform function.
 *    - If the value is 'default', the default value is set.
 *    - Otherwise, the value is set to the value from the request body.
 * Secondly, for each config in the provider's configuration:
 *    - If the parameter is required and no value is provided, the parameter is set to the default value.
 *
 * Note: This ignores min and max.
 *
 * @param providerConfig - The configuration for the AI provider.
 * @param params - The parameters for the request.
 * @param fn - The function to call on the AI provider.
 *
 * @returns The transformed request body.
 */
const getProviderRequestJSON = (
  providerConfig: ProviderConfig,
  params: Params
): { [key: string]: any } => {
  const transformedRequest: { [key: string]: any } = {};
  for (const param in params) {
    const config = providerConfig[param];
    const isConfigPresent: boolean = Boolean(config);
    if (isConfigPresent) {
      const isAtleastOneTransformerPresent: boolean = Array.isArray(config)
        ? config.some((c: any) => Boolean(c.transform))
        : Boolean(config.transform);
      const transformers = Array.isArray(config) ? [...config] : [config];
      if (isAtleastOneTransformerPresent) {
        for (const transformer of transformers) {
          if (transformer.transform)
            transformedRequest[transformer.param] =
              transformer.transform(params);
        }
      } else {
        for (const transformer of transformers) {
          const setDefault: boolean = params[param] === 'default';
          if (setDefault) {
            transformedRequest[transformer.param] = transformer.default;
          } else {
            transformedRequest[transformer.param] = params[param];
          }
        }
      }
    } else {
      transformedRequest[param] = params[param];
    }
  }
  // handle default values
  for (const configKey of Object.keys(providerConfig)) {
    let configObject = providerConfig[configKey];
    if (!Array.isArray(configObject)) configObject = [configObject];
    for (const config of configObject) {
      const isRequiredAndDefaultisKnown: boolean = Boolean(
        configObject && config.required && config.default !== undefined
      );
      const isValueAlreadySet: boolean = transformedRequest[configKey];
      if (isRequiredAndDefaultisKnown && !isValueAlreadySet) {
        transformedRequest[configKey] = config.default;
      }
    }
  }
  return transformedRequest;
};

/**
 * Transforms the request body to match the structure required by the AI provider.
 * It also ensures the values for each parameter are within the minimum and maximum
 * constraints defined in the provider's configuration. If a required parameter is missing,
 * it assigns the default value from the provider's configuration.
 *
 * @param provider - The name of the AI provider.
 * @param params - The parameters for the request.
 * @param fn - The function to call on the AI provider.
 *
 * @returns The transformed request body.
 *
 * @throws {Error} If the provider is not supported.
 */
const transformToProviderRequestJSON = (
  provider: string,
  params: Params,
  fn: string
): { [key: string]: any } => {
  // Get the configuration for the specified provider
  let providerConfig = ProviderConfigs[provider];
  if (providerConfig.getConfig) {
    providerConfig = providerConfig.getConfig(params)[fn];
  } else {
    providerConfig = providerConfig[fn];
  }

  if (!providerConfig) {
    throw new GatewayError(`${fn} is not supported by ${provider}`);
  }

  return getProviderRequestJSON(providerConfig, params);
};

const transformToProviderRequestFormData = (
  provider: string,
  params: Params,
  fn: string
): FormData => {
  let providerConfig = ProviderConfigs[provider];
  if (providerConfig.getConfig) {
    providerConfig = providerConfig.getConfig(params)[fn];
  } else {
    providerConfig = providerConfig[fn];
  }
  const formData = new FormData();
  for (const configParam in providerConfig) {
    let paramConfigs = providerConfig[configParam];
    if (!Array.isArray(paramConfigs)) {
      paramConfigs = [paramConfigs];
    }
    for (const paramConfig of paramConfigs) {
      if (configParam in params) {
        const value = getValue(configParam, params, paramConfig);

        formData.append(paramConfig.param, value);
      } else if (
        paramConfig &&
        paramConfig.required &&
        paramConfig.default !== undefined
      ) {
        formData.append(paramConfig.param, paramConfig.default);
      }
    }
  }
  return formData;
};

/**
 * Transforms the request parameters to the format expected by the provider.
 *
 * @param {string} provider - The name of the provider (e.g., 'openai', 'anthropic').
 * @param {Params} params - The parameters for the request.
 * @param {Params | FormData} inputParams - The original input parameters.
 * @param {endpointStrings} fn - The function endpoint being called (e.g., 'complete', 'chatComplete').
 * @returns {Params | FormData} - The transformed request parameters.
 */
export const transformToProviderRequest = (
  provider: string,
  params: Params,
  inputParams: Params | FormData,
  fn: endpointStrings
) => {
  if (MULTIPART_FORM_DATA_ENDPOINTS.includes(fn)) return inputParams;
  const providerAPIConfig = ProviderConfigs[provider].api;
  if (
    providerAPIConfig.transformToFormData &&
    providerAPIConfig.transformToFormData({ gatewayRequestBody: params })
  )
    return transformToProviderRequestFormData(provider, params as Params, fn);
  return transformToProviderRequestJSON(provider, params as Params, fn);
};

export default transformToProviderRequest;
