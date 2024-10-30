import { env } from 'hono/adapter';
import { GatewayError } from '../../errors/GatewayError';
import { ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import { generateAWSHeaders, getAssumedRoleCredentials } from './utils';

const BedrockAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    `https://bedrock-runtime.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`,
  headers: async ({
    c,
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
  }) => {
    const headers = {
      'content-type': 'application/json',
    };

    if (providerOptions.awsAuthType === 'assumedRole') {
      try {
        // Assume the role in the source account
        const sourceRoleCredentials = await getAssumedRoleCredentials(
          c,
          env(c).AWS_ASSUME_ROLE_SOURCE_ARN, // Role ARN in the source account
          env(c).AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID || '', // External ID for source role (if needed)
          providerOptions.awsRegion || ''
        );

        if (!sourceRoleCredentials) {
          throw new Error('Server Error while assuming internal role');
        }

        // Assume role in destination account using temporary creds obtained in first step
        const { accessKeyId, secretAccessKey, sessionToken } =
          (await getAssumedRoleCredentials(
            c,
            providerOptions.awsRoleArn || '',
            providerOptions.awsExternalId || '',
            providerOptions.awsRegion || '',
            {
              accessKeyId: sourceRoleCredentials.accessKeyId,
              secretAccessKey: sourceRoleCredentials.secretAccessKey,
              sessionToken: sourceRoleCredentials.sessionToken,
            }
          )) || {};
        providerOptions.awsAccessKeyId = accessKeyId;
        providerOptions.awsSecretAccessKey = secretAccessKey;
        providerOptions.awsSessionToken = sessionToken;
      } catch (e) {
        throw new GatewayError('Error while assuming bedrock role');
      }
    }

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
