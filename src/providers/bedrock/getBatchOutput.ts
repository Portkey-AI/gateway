import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { BedrockGetBatchResponse } from './types';
import { getOctetStreamToOctetStreamTransformer } from '../../handlers/streamHandlerUtils';
import { BedrockUploadFileResponseTransforms } from './uploadFileUtils';

const getRowTransform = (provider: string) => {
  return (row: Record<string, any>) =>
    BedrockUploadFileResponseTransforms[provider](row.modelInput);
};

export const BedrockGetBatchOutputRequestHandler = async ({
  c,
  providerOptions,
  requestURL,
}: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
}) => {
  // get s3 file id from batch details
  // get file from s3
  // return file
  let baseUrl = BedrockAPIConfig.getBaseURL({
    providerOptions,
    fn: 'retrieveBatch',
  });
  const batchId = requestURL.split('/v1/batches/')[1].replace('/output', '');
  const retrieveBatchURL = `${baseUrl}/model-invocation-job/${batchId}`;
  const retrieveBatchesHeaders = await BedrockAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveBatchURL,
    gatewayRequestBody: {},
  });
  const retrieveBatchesResponse = await fetch(retrieveBatchURL, {
    method: 'GET',
    headers: retrieveBatchesHeaders,
  });

  const batchDetails: BedrockGetBatchResponse =
    await retrieveBatchesResponse.json();
  const outputFileId = batchDetails.outputDataConfig.s3OutputDataConfig.s3Uri;

  const { awsRegion } = providerOptions;
  const awsS3Bucket = outputFileId.replace('s3://', '').split('/')[0];
  const awsS3ObjectKey = outputFileId
    .replace('s3://', '')
    .split('/')
    .slice(1)
    .join('/');
  const awsModelProvider = batchDetails.modelId.split('/')[1].split('.')[0];

  const s3FileURL = `https://${awsS3Bucket}.s3.${awsRegion}.amazonaws.com/${encodeURIComponent(awsS3ObjectKey)}`;
  const s3FileHeaders = await BedrockAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveFileContent',
    transformedRequestBody: {},
    transformedRequestUrl: s3FileURL,
    gatewayRequestBody: {},
  });
  const s3FileResponse = await fetch(s3FileURL, {
    method: 'GET',
    headers: s3FileHeaders,
  });
  let responseStream: ReadableStream;
  console.log(s3FileResponse.headers);
  if (
    s3FileResponse.headers.get('content-type')?.includes('octet-stream') &&
    s3FileResponse?.body
  ) {
    responseStream = s3FileResponse?.body?.pipeThrough(
      getOctetStreamToOctetStreamTransformer(getRowTransform(awsModelProvider))
    );
  } else {
    responseStream = new ReadableStream();
  }
  return new Response(responseStream, {
    headers: {
      'content-type': 'application/octet-stream',
    },
  });
};

export const BedrockGetBatchOutputResponseTransform = async ({
  response,
}: {
  response: Response;
}) => {
  return response;
};
