import ProviderConfigs from '../providers';
import { Params } from '../types/requestBody';

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
const transformToProviderRequest = (
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

  // If the provider is not supported, throw an error
  if (!providerConfig) {
    throw new Error('Unsupported provider');
  }

  const transformedRequest: { [key: string]: any } = {};

  // For each parameter in the provider's configuration
  for (const configParam in providerConfig) {
    // Get the config for this parameter
    let paramConfigs = providerConfig[configParam];
    if (!Array.isArray(paramConfigs)) {
      paramConfigs = [paramConfigs];
    }

    for (const paramConfig of paramConfigs) {
      // If the parameter is present in the incoming request body
      if (configParam in params) {
        // Get the value for this parameter
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

        // Set the transformed parameter to the validated value
        setNestedProperty(
          transformedRequest,
          paramConfig?.param as string,
          value
        );
      }
      // If the parameter is not present in the incoming request body but is required, set it to the default value
      else if (
        paramConfig &&
        paramConfig.required &&
        paramConfig.default !== undefined
      ) {
        // Set the transformed parameter to the default value
        setNestedProperty(
          transformedRequest,
          paramConfig.param,
          paramConfig.default
        );
      }
    }
  }

  return transformedRequest;
};

export default transformToProviderRequest;
