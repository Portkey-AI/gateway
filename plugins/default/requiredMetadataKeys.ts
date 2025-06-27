import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerResponse,
  PluginParameters,
} from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  const pluginResponse: PluginHandlerResponse = {
    error: null,
    verdict: true,
    data: null,
    transformedData: {
      request: {
        json: null,
      },
      response: {
        json: null,
      },
    },
    transformed: false,
  };

  try {
    // Only process before request hooks
    if (eventType !== 'beforeRequestHook') {
      pluginResponse.error = {
        message: 'This plugin only works for before_request_hooks',
      };
      return pluginResponse;
    }
    const metadataKeys = parameters.metadataKeys;
    if (!(Array.isArray(metadataKeys) && metadataKeys.length > 0)) {
      pluginResponse.error = {
        message: 'metadataKeys must be an array and not empty',
      };
      return pluginResponse;
    }
    if (metadataKeys.some((key: string) => typeof key !== 'string')) {
      pluginResponse.error = {
        message: 'metadataKeys must be an array of strings',
      };
      return pluginResponse;
    }
    if (!['all', 'any', 'none'].includes(parameters.operator)) {
      pluginResponse.error = {
        message: 'operator must be one of: all, any, none',
      };
      return pluginResponse;
    }

    const foundMetadataKeys: string[] = [];
    const missingMetadataKeys: string[] = [];

    const metadata = context.metadata || {};

    metadataKeys.forEach((key: string) => {
      if (key in metadata) {
        foundMetadataKeys.push(key);
      } else {
        missingMetadataKeys.push(key);
      }
    });

    switch (parameters.operator) {
      case 'any':
        pluginResponse.verdict = foundMetadataKeys.length > 0;
        break;
      case 'all':
        pluginResponse.verdict = missingMetadataKeys.length === 0;
        break;
      case 'none':
        pluginResponse.verdict = foundMetadataKeys.length === 0;
        break;
    }

    pluginResponse.data = {
      explanation: `Check ${pluginResponse.verdict ? 'passed' : 'failed'} for '${parameters.operator}' metadata keys.`,
      missing_metadata_keys: missingMetadataKeys,
      found_metadata_keys: foundMetadataKeys,
      operator: parameters.operator,
    };

    if (pluginResponse.verdict) {
      switch (parameters.operator) {
        case 'any':
          pluginResponse.data.explanation += ` At least one metadata key was found.`;
          break;
        case 'all':
          pluginResponse.data.explanation += ` All metadata keys were found.`;
          break;
        case 'none':
          pluginResponse.data.explanation += ` No metadata keys were found.`;
          break;
      }
    } else {
      switch (parameters.operator) {
        case 'any':
          pluginResponse.data.explanation += ` No metadata keys were found.`;
          break;
        case 'all':
          pluginResponse.data.explanation += ` Some metadata keys were missing.`;
          break;
        case 'none':
          pluginResponse.data.explanation += ` Some metadata keys were found.`;
          break;
      }
    }
  } catch (e: any) {
    pluginResponse.error = e;
    pluginResponse.data = null;
  }

  return pluginResponse;
};
