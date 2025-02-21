import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { BedrockGetBatchResponse } from './types';
import { getOctetStreamToOctetStreamTransformer } from '../../handlers/streamHandlerUtils';
import { BedrockUploadFileResponseTransforms } from './uploadFileUtils';
import { BEDROCK } from '../../globals';

const getModelProvider = (modelId: string) => {
  let provider = '';
  if (modelId.includes('llama2')) provider = 'llama2';
  else if (modelId.includes('llama3')) provider = 'llama3';
  else if (modelId.includes('titan')) provider = 'titan';
  else if (modelId.includes('mistral')) provider = 'mistral';
  else if (modelId.includes('anthropic')) provider = 'anthropic';
  else if (modelId.includes('ai21')) provider = 'ai21';
  else if (modelId.includes('cohere')) provider = 'cohere';
  else throw new Error('Invalid model slug');
  return provider;
};

const getRowTransform = (modelId: string) => {
  const provider = getModelProvider(modelId);
  return (row: Record<string, any>) => {
    if (!row.modelOutput && row.error) return row.error;
    const transformedResponse = BedrockUploadFileResponseTransforms[provider](
      row.modelOutput
    );
    transformedResponse.model = modelId;
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
      gatewayRequestURL: requestURL,
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

    const primaryKey = outputFileId?.replace(`s3://${awsS3Bucket}/`, '') ?? '';

    const awsS3ObjectKey = `${primaryKey}${jobId}/${inputS3URIParts[inputS3URIParts.length - 1]}.out`;
    const awsModelProvider = batchDetails.modelId;

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
  } catch (error: any) {
    let errorResponse;

    try {
      errorResponse = JSON.parse(error.message);
      errorResponse.provider = BEDROCK;
    } catch (_e) {
      errorResponse = {
        error: {
          message: error.message,
          type: null,
          param: null,
          code: 500,
        },
        provider: BEDROCK,
      };
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};

export const BedrockGetBatchOutputResponseTransform = (response: Response) => {
  return response;
};
