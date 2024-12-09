import { env } from 'hono/adapter';
import { GatewayError } from '../../errors/GatewayError';
import { ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import {
  generateAWSHeaders,
  generatePresignedUrl,
  getAssumedRoleCredentials,
} from './utils';

const BedrockAPIConfig: ProviderAPIConfig = {
  getMethod: ({ fn, requestMethod }) => {
    if (fn === 'uploadFile') return 'PUT';
    return requestMethod;
  },
  getBaseURL: async ({ providerOptions, fn }) => {
    if (fn === 'uploadFile') {
      const url = `https://${providerOptions.awsS3Bucket}.s3.${providerOptions.awsRegion}.amazonaws.com/${providerOptions.awsS3ObjectKey}`;
      return await generatePresignedUrl(
        url,
        's3',
        providerOptions.awsRegion,
        providerOptions.awsAccessKeyId,
        providerOptions.awsSecretAccessKey
      );
    }
    const isAWSControlPlaneEndpoint = fn === 'createBatch';
    return `https://${isAWSControlPlaneEndpoint ? 'bedrock' : 'bedrock-runtime'}.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`;
  },
  headers: async ({
    c,
    fn,
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
  }) => {
    if (fn === 'uploadFile') {
      const requestHeaders = Object.fromEntries(c.req.raw.headers);
      return {
        'content-type': 'application/octet-stream',
        'content-length': requestHeaders['content-length'],
      };
    }

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
  getEndpoint: ({ fn, gatewayRequestBodyJSON: gatewayRequestBody }) => {
    if (fn === 'uploadFile') return '';

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
      case 'createBatch': {
        return '/model-invocation-job';
      }
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
