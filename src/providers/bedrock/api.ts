import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import { endpointStrings, ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import {
  generateAWSHeaders,
  getAssumedRoleCredentials,
  providerAssumedRoleCredentials,
} from './utils';
import { GatewayError } from '../../errors/GatewayError';

interface BedrockAPIConfigInterface extends Omit<ProviderAPIConfig, 'headers'> {
  headers: (args: {
    c: Context;
    providerOptions: Options;
    fn: string;
    transformedRequestBody: Record<string, any> | string;
    transformedRequestUrl: string;
    gatewayRequestBody?: Params;
  }) => Promise<Record<string, any>> | Record<string, any>;
}

const AWS_CONTROL_PLANE_ENDPOINTS: endpointStrings[] = [
  'createBatch',
  'retrieveBatch',
  'cancelBatch',
  'listBatches',
  'retrieveFileContent',
  'getBatchOutput',
  'cancelBatch',
  'listFinetunes',
  'retrieveFinetune',
  'createFinetune',
  'cancelFinetune',
];

const AWS_GET_METHODS: endpointStrings[] = [
  'listBatches',
  'retrieveBatch',
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
  'retrieveFileContent',
  'listFinetunes',
  'retrieveFinetune',
];

const ENDPOINTS_TO_ROUTE_TO_S3 = [
  'retrieveFileContent',
  'getBatchOutput',
  'retrieveFile',
  'retrieveFileContent',
  'uploadFile',
  'initiateMultipartUpload',
];

const getMethod = (fn: endpointStrings, transformedRequestUrl: string) => {
  if (fn === 'uploadFile') {
    const url = new URL(transformedRequestUrl);
    return url.searchParams.get('partNumber') ? 'PUT' : 'POST';
  }
  return AWS_GET_METHODS.includes(fn as endpointStrings) ? 'GET' : 'POST';
};

const getService = (fn: endpointStrings) => {
  return ENDPOINTS_TO_ROUTE_TO_S3.includes(fn as endpointStrings)
    ? 's3'
    : 'bedrock';
};

const setRouteSpecificHeaders = (
  fn: string,
  headers: Record<string, string>,
  providerOptions: Options
) => {
  if (fn === 'retrieveFile') {
    headers['x-amz-object-attributes'] = 'ObjectSize';
  }
  if (fn === 'initiateMultipartUpload') {
    if (providerOptions.awsServerSideEncryptionKMSKeyId) {
      headers['x-amz-server-side-encryption-aws-kms-key-id'] =
        providerOptions.awsServerSideEncryptionKMSKeyId;
      headers['x-amz-server-side-encryption'] = 'aws:kms';
    }
    if (providerOptions.awsServerSideEncryption) {
      headers['x-amz-server-side-encryption'] =
        providerOptions.awsServerSideEncryption;
    }
  }
};

const BedrockAPIConfig: BedrockAPIConfigInterface = {
  getBaseURL: ({ providerOptions, fn, gatewayRequestURL }) => {
    if (fn === 'retrieveFile') {
      const s3URL = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const bucketName = s3URL.replace('s3://', '').split('/')[0];
      return `https://${bucketName}.s3.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`;
    }
    if (fn === 'retrieveFileContent') {
      const s3URL = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const bucketName = s3URL.replace('s3://', '').split('/')[0];
      return `https://${bucketName}.s3.${providerOptions.awsRegion || 'us-east-1'}.amazonaws.com`;
    }
    if (fn === 'uploadFile')
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
    const method = getMethod(fn as endpointStrings, transformedRequestUrl);
    const service = getService(fn as endpointStrings);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (method === 'PUT' || method === 'GET') {
      delete headers['content-type'];
    }

    setRouteSpecificHeaders(fn, headers, providerOptions);

    if (providerOptions.awsAuthType === 'assumedRole') {
      await providerAssumedRoleCredentials(c, providerOptions);
    }

    let finalRequestBody = transformedRequestBody;

    if (['cancelFinetune', 'cancelBatch'].includes(fn as endpointStrings)) {
      // Cancel doesn't require any body, but fetch is sending empty body, to match the signature this block is required.
      finalRequestBody = '';
    }

    return generateAWSHeaders(
      finalRequestBody,
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
    gatewayRequestURL,
    c,
  }) => {
    if (fn === 'retrieveFile') {
      const fileId = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const s3ObjectKeyParts = fileId.replace('s3://', '').split('/');
      const s3ObjectKey = s3ObjectKeyParts.slice(1).join('/');
      return `/${s3ObjectKey}?attributes`;
    }
    if (fn === 'retrieveFileContent') {
      const fileId = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const s3ObjectKeyParts = fileId
        .replace('s3://', '')
        .replace('/content', '')
        .split('/');
      const s3ObjectKey = s3ObjectKeyParts.slice(1).join('/');
      return `/${s3ObjectKey}`;
    }
    if (fn === 'uploadFile') return '';
    if (fn === 'cancelBatch') {
      const batchId = gatewayRequestURL.split('/v1/batches/')[1].split('/')[0];
      return `/model-invocation-job/${batchId}/stop`;
    }
    const { model, stream } = gatewayRequestBody;
    if (!model) {
      throw new GatewayError('Model is required');
    }
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

    const jobIdIndex = fn === 'cancelFinetune' ? -2 : -1;
    const jobId = gatewayRequestURL.split('/').at(jobIdIndex);

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
        return `/model-invocation-job/${gatewayRequestURL.split('/').pop()}/stop`;
      }
      case 'retrieveBatch': {
        return `/model-invocation-job/${gatewayRequestURL.split('/v1/batches/')[1]}`;
      }
      case 'listBatches': {
        return '/model-invocation-jobs';
      }
      case 'listFinetunes': {
        return '/model-customization-jobs';
      }
      case 'retrieveFinetune': {
        return `/model-customization-jobs/${jobId}`;
      }
      case 'createFinetune': {
        return '/model-customization-jobs';
      }
      case 'cancelFinetune': {
        return `/model-customization-jobs/${jobId}/stop`;
      }
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
