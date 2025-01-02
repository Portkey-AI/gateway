import { env } from 'hono/adapter';
import { GatewayError } from '../../errors/GatewayError';
import { endpointStrings, ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import { generateAWSHeaders, getAssumedRoleCredentials } from './utils';

const AWS_CONTROL_PLANE_ENDPOINTS: endpointStrings[] = [
  'createBatch',
  'retrieveBatch',
  'cancelBatch',
  'listBatches',
  'retrieveFileContent',
  'getBatchOutput',
];

const AWS_GET_METHODS: endpointStrings[] = [
  'listBatches',
  'retrieveBatch',
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
];

const S3_ENDPOINTS: endpointStrings[] = [
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
];

const BedrockAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'retrieveFile')
      return `https://${providerOptions.awsS3Bucket}.s3.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`;
    const isAWSControlPlaneEndpoint =
      fn && AWS_CONTROL_PLANE_ENDPOINTS.includes(fn);
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

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (AWS_GET_METHODS.includes(fn as endpointStrings)) {
      delete headers['content-type'];
    }

    if (fn === 'retrieveFile') {
      headers['x-amz-object-attributes'] = 'ObjectSize';
    }

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

    const method = AWS_GET_METHODS.includes(fn as endpointStrings)
      ? 'GET'
      : 'POST';

    const service = S3_ENDPOINTS.includes(fn as endpointStrings)
      ? 's3'
      : 'bedrock';

    return generateAWSHeaders(
      transformedRequestBody,
      headers,
      transformedRequestUrl,
      method,
      service,
      providerOptions.awsRegion || '',
      providerOptions.awsAccessKeyId || '',
      providerOptions.awsSecretAccessKey || '',
      providerOptions.awsSessionToken || ''
    );
  },
  getEndpoint: ({
    fn,
    gatewayRequestBodyJSON: gatewayRequestBody,
    requestURL,
  }) => {
    if (fn === 'uploadFile') return '';

    const { model, stream } = gatewayRequestBody;
    let mappedFn = fn;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }
    let endpoint = `/model/${model}/invoke`;
    let streamEndpoint = `/model/${model}/invoke-with-response-stream`;
    if (
      (mappedFn === 'chatComplete' || mappedFn === 'stream-chatComplete') &&
      model &&
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
      case 'cancelBatch': {
        return `/model-invocation-job/${requestURL.split('/').pop()}/stop`;
      }
      case 'retrieveBatch': {
        return `/model-invocation-job/${requestURL.split('/v1/batches/')[1]}`;
      }
      case 'listBatches': {
        return '/model-invocation-jobs';
      }
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
