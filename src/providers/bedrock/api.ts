import { Context } from 'hono';
import { Options, Params } from '../../types/requestBody';
import { endpointStrings, ProviderAPIConfig } from '../types';
import { bedrockInvokeModels } from './constants';
import {
  awsEndpointDomain,
  generateAWSHeaders,
  getAssumedRoleCredentials,
  getBedrockModelWithoutRegion,
  getFoundationModelFromInferenceProfile,
  getRegionFromEnv,
  getS3EncryptionHeaders,
} from './utils';
import { env } from 'hono/adapter';
import { getProviderAndModel } from '.';
import { ANTHROPIC } from '../../globals';

interface BedrockAPIConfigInterface extends Omit<ProviderAPIConfig, 'headers'> {
  headers: (args: {
    c: Context;
    providerOptions: Options;
    fn: string;
    transformedRequestBody: Record<string, any> | string;
    transformedRequestUrl: string;
    gatewayRequestBody?: Params;
    headers?: Record<string, string>;
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

const getControlPlaneEndpoint = (fn: endpointStrings | undefined) => {
  if (fn && AWS_CONTROL_PLANE_ENDPOINTS.includes(fn)) return 'bedrock';
  if (fn && fn === 'rerank') return 'bedrock-agent-runtime';
  return 'bedrock-runtime';
};

const getMethod = (
  fn: endpointStrings,
  transformedRequestUrl: string,
  c: Context
) => {
  if (fn === 'proxy') {
    return c.req.method;
  }
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

const isAnthropicModelOnMessagesRoute = (
  provider: string,
  fn: endpointStrings
) => {
  return (
    provider === ANTHROPIC && (fn === 'messages' || fn === 'stream-messages')
  );
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
    const encryptionHeaders = getS3EncryptionHeaders({});
    // if encryption headers are present, add them to the headers
    if (Object.keys(encryptionHeaders).length > 0) {
      Object.assign(headers, encryptionHeaders);
    }
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
  getBaseURL: async ({ providerOptions, fn, gatewayRequestURL, params, c }) => {
    if (providerOptions.awsAuthType === 'serviceRole') {
      providerOptions.awsRegion =
        providerOptions.awsRegion || getRegionFromEnv();
    }
    const model = decodeURIComponent(params?.model || '');
    if (model.includes('arn:aws') && params) {
      const foundationModel = model.includes('foundation-model/')
        ? model.split('/').pop()
        : await getFoundationModelFromInferenceProfile(
            model,
            providerOptions,
            env(c)
          );
      if (foundationModel) {
        params.foundationModel = foundationModel;
      }
    }
    if (fn === 'retrieveFile') {
      const s3URL = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const bucketName = s3URL.replace('s3://', '').split('/')[0];
      return `https://${bucketName}.s3.${providerOptions.awsRegion || 'us-east-1'}.${awsEndpointDomain}`;
    }
    if (fn === 'retrieveFileContent') {
      const s3URL = decodeURIComponent(
        gatewayRequestURL.split('/v1/files/')[1]
      );
      const bucketName = s3URL.replace('s3://', '').split('/')[0];
      return `https://${bucketName}.s3.${providerOptions.awsRegion || 'us-east-1'}.${awsEndpointDomain}`;
    }
    if (fn === 'uploadFile')
      return `https://${providerOptions.awsS3Bucket}.s3.${providerOptions.awsRegion || 'us-east-1'}.${awsEndpointDomain}`;
    return `https://${getControlPlaneEndpoint(fn)}.${providerOptions.awsRegion || 'us-east-1'}.${awsEndpointDomain}`;
  },
  headers: async ({
    fn,
    providerOptions,
    transformedRequestBody,
    transformedRequestUrl,
    gatewayRequestBody, // for proxy use the passed body blindly
    c,
    headers: requestHeaders,
  }) => {
    const { awsService, awsAuthType } = providerOptions;
    const method =
      c.get('method') || // method set specifically into context
      getMethod(fn as endpointStrings, transformedRequestUrl, c); // method calculated
    const service = awsService || getService(fn as endpointStrings);

    let headers: Record<string, string> = {};

    if (fn === 'proxy' && service !== 'bedrock') {
      headers = { ...(requestHeaders ?? {}) };
    } else {
      headers = {
        'content-type': 'application/json',
      };
    }

    if ((method === 'PUT' || method === 'GET') && fn !== 'proxy') {
      delete headers['content-type'];
    }

    setRouteSpecificHeaders(fn, headers, providerOptions);
    const cEnv = env(c);

    if (awsAuthType === 'assumedRole') {
      const { accessKeyId, secretAccessKey, sessionToken } =
        (await getAssumedRoleCredentials(
          providerOptions.awsRoleArn || '',
          providerOptions.awsExternalId || '',
          providerOptions.awsRegion || '',
          undefined,
          undefined,
          cEnv
        )) || {};
      providerOptions.awsAccessKeyId = accessKeyId;
      providerOptions.awsSecretAccessKey = secretAccessKey;
      providerOptions.awsSessionToken = sessionToken;
    } else if (providerOptions.awsAuthType === 'serviceRole') {
      const { accessKeyId, secretAccessKey, sessionToken, awsRegion } =
        (await getAssumedRoleCredentials(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          cEnv
        )) || {};
      providerOptions.awsAccessKeyId = accessKeyId;
      providerOptions.awsSecretAccessKey = secretAccessKey;
      providerOptions.awsSessionToken = sessionToken;
      // Only fallback to credentials region if user didn't specify one (for cross-region support)
      providerOptions.awsRegion = providerOptions.awsRegion || awsRegion;
    }

    if (awsAuthType === 'apiKey') {
      headers['Authorization'] = `Bearer ${providerOptions.apiKey}`;
      return headers;
    }

    let finalRequestBody =
      fn === 'proxy' ? gatewayRequestBody : transformedRequestBody;

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
    const { provider } = getProviderAndModel(gatewayRequestBody);
    const decodedModel = decodeURIComponent(model ?? '');
    const uriEncodedModel = encodeURIComponent(decodedModel);
    const modelWithoutRegion = getBedrockModelWithoutRegion(decodedModel);
    const uriEncodedModelWithoutRegion = encodeURIComponent(modelWithoutRegion);
    let mappedFn: string = fn;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }
    let endpoint = `/model/${uriEncodedModel}/invoke`;
    let streamEndpoint = `/model/${uriEncodedModel}/invoke-with-response-stream`;
    if (
      (mappedFn === 'chatComplete' ||
        mappedFn === 'stream-chatComplete' ||
        mappedFn === 'messages' ||
        mappedFn === 'stream-messages') &&
      !isAnthropicModelOnMessagesRoute(provider, fn) &&
      model &&
      !bedrockInvokeModels.includes(model)
    ) {
      endpoint = `/model/${uriEncodedModel}/converse`;
      streamEndpoint = `/model/${uriEncodedModel}/converse-stream`;
    }

    const jobIdIndex = fn === 'cancelFinetune' ? -2 : -1;
    const jobId = gatewayRequestURL.split('/').at(jobIdIndex);

    switch (mappedFn) {
      case 'chatComplete':
      case 'messages': {
        return endpoint;
      }
      case 'stream-chatComplete':
      case 'stream-messages': {
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
      case 'messagesCountTokens': {
        return `/model/${uriEncodedModelWithoutRegion}/count-tokens`;
      }
      case 'rerank': {
        return '/rerank';
      }
      default:
        return '';
    }
  },
};

export default BedrockAPIConfig;
