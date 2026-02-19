import crypto from 'crypto';
import { nodeLineReader } from '../../handlers/streamHandlerUtils';
import {
  BedrockUploadFileTransformerConfig,
  transformFinetuneDatasetLine,
  tryChatToTextTransformation,
} from './uploadFileUtils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { Context } from 'hono';
import { BEDROCK, POWERED_BY } from '../../globals';
import {
  awsEndpointDomain,
  getAssumedRoleCredentials,
  getFoundationModelFromInferenceProfile,
} from './utils';
import BedrockAPIConfig from './api';
import { RequestHandler } from '../../providers/types';
import { Options } from '../../types/requestBody';
import { PassThrough, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { retriableApiReq } from '../../services/winky/utils/helpers';
import { externalServiceFetch } from '../../utils/fetch';
import { env } from 'hono/adapter';

const MIN_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type#media-type
const isBoundary = (chunk: string) => {
  return chunk.startsWith('--');
};

const isHeader = (chunk: string) => {
  return (
    chunk.startsWith('Content-Disposition: form-data') ||
    chunk.includes('Content-Type:')
  );
};

class AwsMultipartUploadHandler {
  private bucket: string;
  private objectKey: string;
  private region: string;
  private uploadId?: string;
  private url: URL;
  private parts: { PartNumber: number; ETag: string }[] = [];
  private providerOptions: Options;
  private c: Context;
  public contentLength: number = 0;

  constructor(
    region: string = 'us-east-1',
    bucket: string = '',
    objectKey: string = '',
    providerOptions: Options,
    c: Context
  ) {
    this.region = region;
    this.bucket = bucket;
    this.objectKey = objectKey;
    this.url = new URL(
      `https://${bucket}.s3.${region}.${awsEndpointDomain}/${objectKey}?uploads`
    );
    this.providerOptions = providerOptions;
    this.c = c;
  }

  async initiateMultipartUpload() {
    const method = 'POST';
    const headers = await BedrockAPIConfig.headers({
      c: this.c,
      providerOptions: this.providerOptions,
      fn: 'initiateMultipartUpload',
      transformedRequestBody: {},
      transformedRequestUrl: this.url.toString(),
    });

    // Step 5: Send Request
    const response = await externalServiceFetch(this.url.toString(), {
      method,
      headers,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        JSON.stringify({
          type: 'provider_error',
          code: response.status,
          param: null,
          message: 'bedrock error: ' + errorText,
        })
      );
    }

    const responseBody = await response.text();
    const uploadIdMatch = responseBody.match(/<UploadId>(.+?)<\/UploadId>/);
    if (!uploadIdMatch)
      throw new Error('Failed to parse UploadId from response');
    this.uploadId = uploadIdMatch[1];
    return uploadIdMatch[1];
  }

  async pushCurrentPart(
    passThrough: PassThrough,
    partNumber: number,
    lastPart?: boolean
  ) {
    let chunk = passThrough.read();
    while (passThrough.readableLength > 0) {
      chunk = passThrough?.read();
    }

    const partLength = chunk.length;

    await this.uploadPart(partNumber, chunk);

    if (lastPart) {
      await this.completeMultipartUpload();
    }

    return partLength;
  }

  async chunkAndUploadStream(
    awsBedrockModel: string,
    requestBody: Readable,
    requestHeaders: Record<string, string>,
    modelType: string
  ) {
    const providerConfig = getProviderConfig(awsBedrockModel);

    let partNumber = 1;
    let isPurposeHeader = false;
    const result: { purpose: string; error: Error | null } = {
      purpose: '',
      error: null,
    };
    let line = 0;

    const lineReader = nodeLineReader();

    const passThrough = new PassThrough();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const classThis = this;

    const transform = new Transform({
      transform: async function (chunk, encoding, callback) {
        let buffer;
        try {
          const _chunk = chunk.toString();

          const match = _chunk.match(/name="([^"]+)"/);
          const headerKey = match ? match[1] : null;

          if (headerKey && headerKey === 'purpose') {
            isPurposeHeader = true;
            callback();
            return;
          }

          if (isPurposeHeader && _chunk?.length > 0 && !result.purpose) {
            isPurposeHeader = false;
            result.purpose = _chunk.trim();
            callback();
            return;
          }

          if (isBoundary(_chunk) || isHeader(_chunk)) {
            callback();
            return;
          }

          if (!_chunk) {
            callback();
            return;
          }

          // chunk should always be a json compatible string.
          const json = JSON.parse(chunk.toString());
          if (json && !result.purpose) {
            // Close the stream.
            this.end();
            callback(new Error('Invalid value for purpose'));
            return;
          }
          line++;
          // Upload the chunk if it's big enough.
          // upload part is needed here, since the upload is an async operation and `pipeline` is async.
          if (
            (passThrough.writableLength || passThrough.readableLength) >=
            MIN_CHUNK_SIZE
          ) {
            const partLength = await classThis.pushCurrentPart(
              passThrough,
              partNumber
            );
            partNumber++;
            classThis.contentLength += partLength;
          }
          // end of upload part

          if (result.purpose === 'fine-tune') {
            const transformedLine =
              modelType === 'text'
                ? tryChatToTextTransformation(json)
                : transformFinetuneDatasetLine(json);
            if (!transformedLine) {
              // Skip this line if it is not a valid json line
              return;
            }
            buffer = JSON.stringify(transformedLine) + '\n';
          } else {
            const modelInput = transformUsingProviderConfig(
              providerConfig,
              json.body
            );
            const transformedLine = {
              recordId: json.custom_id,
              modelInput: modelInput,
            };
            buffer = JSON.stringify(transformedLine) + '\n';
          }
        } catch (error) {
          result.error = new Error(
            `Found invalid JSON at line ${line}: ${error}`
          );
        }

        if (result.error) {
          this.end();
          callback(result.error);
          return;
        }

        if (buffer) {
          passThrough.push(buffer);
        }
        callback();
      },
      flush: async (callback) => {
        const partLength = await classThis.pushCurrentPart(
          passThrough,
          partNumber,
          true
        );
        classThis.contentLength += partLength;
        callback();
      },
    });

    await pipeline(requestBody, lineReader, transform);
    return result;
  }

  async uploadPart(partNumber: number, partData: Uint8Array | Buffer) {
    const method = 'PUT';
    const partUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.${awsEndpointDomain}/${this.objectKey}?partNumber=${partNumber}&uploadId=${this.uploadId}`
    );
    const headers = await BedrockAPIConfig.headers({
      c: this.c,
      providerOptions: this.providerOptions,
      fn: 'uploadFile',
      transformedRequestBody: partData,
      transformedRequestUrl: partUrl.toString(),
    });

    const response = await retriableApiReq({}, partUrl.toString(), {
      method,
      headers,
      body: partData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        JSON.stringify({
          type: 'provider_error',
          code: response.status,
          param: null,
          message: 'bedrock error: ' + errorText,
        })
      );
    }

    const eTag = response.headers.get('ETag');
    if (!eTag) throw new Error(`unable to upload to s3, please try again`);

    this.parts.push({ PartNumber: partNumber, ETag: eTag });
  }

  async abortMultipartUpload() {
    const method = 'DELETE';
    const abortUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.${awsEndpointDomain}/${this.objectKey}?uploadId=${this.uploadId}`
    );
    this.c.set('method', 'DELETE');
    const headers = await BedrockAPIConfig.headers({
      c: this.c,
      providerOptions: this.providerOptions,
      fn: 'uploadFile',
      transformedRequestUrl: abortUrl.toString(),
      transformedRequestBody: '',
    });

    await externalServiceFetch(abortUrl.toString(), {
      method,
      headers,
      body: '',
    });
    return true;
  }

  async completeMultipartUpload() {
    const method = 'POST';
    const completeUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.${awsEndpointDomain}/${this.objectKey}?uploadId=${this.uploadId}`
    );
    const partsXml = this.parts
      .map(
        (part) =>
          `<Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${part.ETag}</ETag></Part>`
      )
      .join('');

    const payload = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

    const headers = await BedrockAPIConfig.headers({
      c: this.c,
      providerOptions: this.providerOptions,
      fn: 'uploadFile',
      transformedRequestBody: payload,
      transformedRequestUrl: completeUrl.toString(),
    });

    const response = await externalServiceFetch(completeUrl.toString(), {
      method,
      headers,
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        JSON.stringify({
          type: 'provider_error',
          code: response.status,
          param: null,
          message: 'bedrock error: ' + errorText,
        })
      );
    }

    return response;
  }
}

const getProviderConfig = (modelSlug: string) => {
  let provider = '';
  if (modelSlug.includes('llama2')) provider = 'llama2';
  else if (modelSlug.includes('llama3')) provider = 'llama3';
  else if (modelSlug.includes('titan')) provider = 'titan';
  else if (modelSlug.includes('mistral')) provider = 'mistral';
  else if (modelSlug.includes('anthropic')) provider = 'anthropic';
  else if (modelSlug.includes('ai21')) provider = 'ai21';
  else if (modelSlug.includes('cohere')) provider = 'cohere';
  else if (modelSlug.includes('amazon')) provider = 'titan';
  else throw new Error('Invalid model slug');
  return BedrockUploadFileTransformerConfig[provider];
};

export const BedrockUploadFileRequestHandler: RequestHandler<
  ReadableStream
> = async ({
  providerOptions: providerOptions,
  requestBody,
  requestHeaders,
  c,
}) => {
  const webStream = Readable.fromWeb(requestBody as any);
  let onError: (() => Promise<void>) | null = null;
  const cEnv = env(c);
  try {
    // get aws credentials and parse provider options
    if (providerOptions.awsAuthType === 'assumedRole') {
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
    const {
      awsRegion,
      awsS3Bucket,
      awsBedrockModel: modelParam,
    } = providerOptions;

    const awsS3ObjectKey =
      providerOptions.awsS3ObjectKey || crypto.randomUUID() + '.jsonl';

    if (!awsS3Bucket || !modelParam) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message:
            'Please make sure you have x-portkey-aws-s3-bucket, x-portkey-aws-s3-object-key and x-portkey-aws-bedrock-model headers provided.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }

    let awsBedrockModel = modelParam;

    if (awsBedrockModel.includes('arn:aws')) {
      const foundationModel = awsBedrockModel.includes('foundation-model/')
        ? awsBedrockModel.split('/').pop()
        : await getFoundationModelFromInferenceProfile(
            awsBedrockModel,
            providerOptions,
            cEnv
          );
      if (foundationModel) {
        awsBedrockModel = foundationModel;
      }
    }

    const handler = new AwsMultipartUploadHandler(
      awsRegion,
      awsS3Bucket,
      awsS3ObjectKey,
      providerOptions,
      c
    );

    onError = async () => {
      await handler.abortMultipartUpload();
    };

    const modelType = requestHeaders[`x-${POWERED_BY}-model-type`];

    if (!awsBedrockModel || !awsS3Bucket)
      throw new Error(
        'awsBedrockModel and awsS3Bucket are required to upload a file'
      );

    // upload file to s3
    await handler.initiateMultipartUpload();
    const { purpose, error } = await handler.chunkAndUploadStream(
      awsBedrockModel,
      webStream,
      requestHeaders,
      modelType
    );

    if (!purpose || error) {
      await onError?.();
      const _errorMessage = !purpose
        ? 'Purpose is invalid'
        : error?.message || 'Unknown error';
      return new Response(
        JSON.stringify({
          error: {
            message: _errorMessage,
            type: null,
            param: null,
            provider: BEDROCK,
          },
        }),
        { status: 400 }
      );
    }
    // construct and return response
    const s3Url = `s3://${awsS3Bucket}/${awsS3ObjectKey}`;
    const responseJson = {
      id: encodeURIComponent(s3Url),
      object: 'file',
      created_at: Math.floor(Date.now() / 1000),
      filename: s3Url,
      purpose,
      bytes: handler.contentLength,
      status: 'processed',
      status_details: '',
    };

    return new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    let errorResponse;
    await onError?.();
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

export const BedrockUploadFileResponseTransform = (response: any) => {
  return response;
};
