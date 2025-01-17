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
  'cancelBatch',
];

const AWS_GET_METHODS: endpointStrings[] = [
  'listBatches',
  'retrieveBatch',
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
  'retrieveFileContent',
];

const S3_ENDPOINTS: endpointStrings[] = [
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
  'retrieveFileContent',
];

const BedrockAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'retrieveFile' || fn === 'retrieveFileContent')
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

    const method = AWS_GET_METHODS.includes(fn as endpointStrings)
      ? 'GET'
      : 'POST';

    const service = S3_ENDPOINTS.includes(fn as endpointStrings)
      ? 's3'
      : 'bedrock';

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
      method,
      service,
      providerOptions.awsRegion || '',
      providerOptions.awsAccessKeyId || '',
      providerOptions.awsSecretAccessKey || '',
      providerOptions.awsSessionToken || ''
    );
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON, gatewayRequestURL }) => {
    switch (fn) {
      case 'uploadFile':
        return '';
      case 'retrieveFile':
        return '';
      case 'listFiles':
        return '';
      case 'deleteFile':
        return '';
      case 'retrieveFileContent': {
        const objectName = gatewayRequestURL
          .split('/v1/files/')[1]
          .split('/')[0];
        return `/${objectName}`;
      }
      case 'getBatchOutput':
        return '';
      case 'createBatch': {
        return '/model-invocation-job';
      }
      case 'cancelBatch': {
        return `/model-invocation-job/${gatewayRequestURL.split('/v1/batches/')[1].split('/')[0]}/stop`;
      }
      case 'retrieveBatch': {
        return `/model-invocation-job/${gatewayRequestURL.split('/v1/batches/')[1]}`;
      }
      case 'listBatches': {
        return '/model-invocation-jobs';
      }
      default:
        break;
    }

    const { model, stream } = gatewayRequestBodyJSON;
    if (!model) throw new GatewayError('Model is required');
    let mappedFn: string = fn;
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
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
