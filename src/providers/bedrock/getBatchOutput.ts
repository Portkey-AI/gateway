import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { BedrockGetBatchResponse } from './types';
import { getOctetStreamToOctetStreamTransformer } from '../../handlers/streamHandlerUtils';
import { BedrockUploadFileResponseTransforms } from './uploadFileUtils';

const getRowTransform = (provider: string) => {
  return (row: Record<string, any>) => {
    const transformedResponse = BedrockUploadFileResponseTransforms[provider](
      row.modelOutput
    );
    return {
      id: row.modelOutput.id,
      custom_id: row.recordId,
      response: {
        status_code: 200,
        request_id: row.modelOutput.id,
        body: transformedResponse,
      },
      error: null,
    };
  };
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
  try {
    // get s3 file id from batch details
    // get file from s3
    // return file
    const baseUrl = BedrockAPIConfig.getBaseURL({
      providerOptions,
      fn: 'retrieveBatch',
      c,
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
    const jobId = batchDetails.jobArn.split('/')[1];
    const inputS3URIParts =
      batchDetails.inputDataConfig.s3InputDataConfig.s3Uri.split('/');

    const awsS3ObjectKey = `${jobId}/${inputS3URIParts[inputS3URIParts.length - 1]}.out`;
    const awsModelProvider = batchDetails.modelId.split('/')[1].split('.')[0];

    const s3FileURL = `https://${awsS3Bucket}.s3.${awsRegion}.amazonaws.com/${awsS3ObjectKey}`;
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
    if (
      s3FileResponse.headers.get('content-type')?.includes('octet-stream') &&
      s3FileResponse?.body
    ) {
      responseStream = s3FileResponse?.body?.pipeThrough(
        getOctetStreamToOctetStreamTransformer(
          getRowTransform(awsModelProvider)
        )
      );
      return new Response(responseStream, {
        headers: {
          'content-type': 'application/octet-stream',
        },
      });
    } else {
      const body = await s3FileResponse.text();
      throw new Error(body);
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 500,
    });
  }
};

export const BedrockGetBatchOutputResponseTransform = async ({
  response,
}: {
  response: Response;
}) => {
  return response;
};
