import { GatewayError } from '../../errors/GatewayError';
import { ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import { generateAWSHeaders } from './utils';

const BedrockAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    `https://bedrock-runtime.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`,
  headers: async ({
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
  }) => {
    const headers = {
      'content-type': 'application/json',
    };

    return generateAWSHeaders(
      transformedRequestBody,
      headers,
      transformedRequestUrl,
      'POST',
      'bedrock',
      providerOptions.awsRegion || '',
      providerOptions.awsAccessKeyId || '',
      providerOptions.awsSecretAccessKey || '',
      providerOptions.awsSessionToken || ''
    );
  },
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    const { model, stream } = gatewayRequestBody;
    if (!model) throw new GatewayError('Model is required');
    let mappedFn = fn;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }
    let endpoint = `/model/${model}/invoke`;
    let streamEndpoint = `/model/${model}/invoke-with-response-stream`;
    if (
      (mappedFn === 'chatComplete' || mappedFn === 'stream-chatComplete') &&
      !bedrockInvokeModels.includes(model)
    ) {
      endpoint = `/model/${model}/converse`;
      streamEndpoint = `/model/${model}/converse-stream`;
    }
    switch (mappedFn) {
      case 'chatComplete': {
        return endpoint;
      }
      case 'stream-chatComplete': {
        return streamEndpoint;
      }
      case 'complete': {
        return endpoint;
      }
      case 'stream-complete': {
        return streamEndpoint;
      }
      case 'embed': {
        return endpoint;
      }
      case 'imageGenerate': {
        return endpoint;
      }
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
