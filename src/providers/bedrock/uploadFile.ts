import { getBoundaryFromContentType } from '../../handlers/streamHandlerUtils';
import {
  BedrockUploadFileTransformerConfig,
  transformFinetuneDatasetLine,
  tryChatToTextTransformation,
} from './uploadFileUtils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { Context } from 'hono';
import { BEDROCK, POWERED_BY } from '../../globals';
import { providerAssumedRoleCredentials } from './utils';
import BedrockAPIConfig from './api';
import { ProviderConfig, RequestHandler } from '../../providers/types';
import { Options } from '../../types/requestBody';

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
      `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}?uploads`
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
    const response = await fetch(this.url.toString(), { method, headers });
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

  async chunkAndUploadStream(
    awsBedrockModel: string,
    requestBody: ReadableStream,
    requestHeaders: Record<string, string>,
    purpose: string,
    modelType: string
  ) {
    const providerConfig = getProviderConfig(awsBedrockModel);

    const reader = requestBody.getReader();
    let partNumber = 1;
    const decoder = new TextDecoder();
    const boundary =
      '--' + getBoundaryFromContentType(requestHeaders['content-type']);
    let currentChunk = '';
    let isParsingHeaders = true;
    let currentHeaders = '';
    let isFileContent = false;

    while (true) {
      const { done, value } = await reader.read();

      currentChunk += decoder.decode(value, { stream: true });

      // 1MB chunk size
      if (currentChunk.length < 1000000 && !done) continue;

      while (currentChunk.length > 0) {
        if (isParsingHeaders) {
          const headersEndIndex = currentChunk.indexOf('\r\n\r\n');
          const boundaryEndIndex =
            currentChunk.indexOf(boundary) + boundary.length + 2;
          // if (headersEndIndex < 0) break;
          currentHeaders += currentChunk.slice(
            boundaryEndIndex,
            headersEndIndex
          );
          isFileContent = currentHeaders.includes(
            'Content-Disposition: form-data; name="file"'
          );
          if (isFileContent) {
            const filename = currentHeaders.match(/filename="(.+?)"/)?.[1];
            const fileExtension = filename?.split('.').pop();
            if (fileExtension !== 'jsonl') {
              throw new Error(
                'Invalid file extension, only jsonl files are supported'
              );
            }
          }

          currentChunk = currentChunk.slice(headersEndIndex + 4);
          isParsingHeaders = false;
        }

        const boundaryIndex = currentChunk.indexOf(boundary);

        const safeLength = boundaryIndex ?? currentChunk.length;
        // if (safeLength <= 0) break;

        const content = currentChunk.slice(0, safeLength);
        if (isFileContent) {
          let uploadLength = 0;
          [currentChunk, uploadLength] =
            await transformAndUploadFileContentParts(
              content,
              currentChunk,
              providerConfig,
              this,
              partNumber,
              purpose ?? 'batch',
              modelType ?? 'chat'
            );
          this.contentLength += uploadLength;
          partNumber++;
        } else {
          currentChunk = currentChunk.slice(safeLength);
        }

        if (currentChunk.startsWith(`${boundary}--`)) {
          currentChunk = '';
        } else if (currentChunk.startsWith(boundary)) {
          isParsingHeaders = true;
          currentHeaders = '';
        } else {
          break;
        }
      }
      if (done) break;
    }
  }

  async uploadPart(partNumber: number, partData: Uint8Array | Buffer) {
    const method = 'PUT';
    const partUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.amazonaws.com/${this.objectKey}?partNumber=${partNumber}&uploadId=${this.uploadId}`
    );
    const headers = await BedrockAPIConfig.headers({
      c: this.c,
      providerOptions: this.providerOptions,
      fn: 'uploadFile',
      transformedRequestBody: partData,
      transformedRequestUrl: partUrl.toString(),
    });

    const response = await fetch(partUrl.toString(), {
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

  async completeMultipartUpload() {
    const method = 'POST';
    const completeUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.amazonaws.com/${this.objectKey}?uploadId=${this.uploadId}`
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

    const response = await fetch(completeUrl.toString(), {
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

const transformAndUploadFileContentParts = async (
  chunk: string,
  buffer: string,
  providerConfig: ProviderConfig,
  handler: AwsMultipartUploadHandler,
  partNumber: number,
  purpose: string,
  modelType: string
): Promise<[string, number]> => {
  let transformedChunkToUpload = '';
  const jsonLines = chunk.split('\n');
  const numberOfLines = jsonLines.length;
  for (let i = 0; i < numberOfLines; i++) {
    const line = jsonLines[i];
    if (line === '\r') {
      buffer = buffer.slice(line.length + 1);
      continue;
    }
    try {
      const json = JSON.parse(line);
      if (purpose === 'fine-tune') {
        const transformedLine =
          modelType === 'text'
            ? tryChatToTextTransformation(json)
            : transformFinetuneDatasetLine(json);
        if (!transformedLine) {
          // Skip this line if it is not a valid json line
          continue;
        }
        transformedChunkToUpload += JSON.stringify(transformedLine) + '\r\n';
        buffer = buffer.slice(line.length + 1);
        continue;
      }
      const transformedLine = {
        recordId: json.custom_id,
        modelInput: transformUsingProviderConfig(providerConfig, json.body),
      };
      transformedChunkToUpload += JSON.stringify(transformedLine) + '\r\n';
      buffer = buffer.slice(line.length + 1);
    } catch (error) {
      if (i !== numberOfLines - 1) {
        throw new Error(
          'Your file contains invalid json lines, or empty lines, please fix them and try again: ' +
            '\n failing line: ' +
            line +
            '\n failing chunk: ' +
            chunk
        );
      }
      // this is not a valid json line, so we don't update the buffer
    }
  }
  await handler.uploadPart(partNumber, Buffer.from(transformedChunkToUpload));
  return [buffer, transformedChunkToUpload.length];
};

const getProviderConfig = (modelSlug: string) => {
  let provider = '';
  if (modelSlug.includes('llama2')) provider = 'llama2';
  else if (modelSlug.includes('llama3')) provider = 'llama3';
  else if (modelSlug.includes('titan')) provider = 'titan';
  else if (modelSlug.includes('mistral')) provider = 'mistral';
  else if (modelSlug.includes('anthropic')) provider = 'anthropic';
  else if (modelSlug.includes('ai21')) provider = 'ai21';
  else if (modelSlug.includes('cohere')) provider = 'cohere';
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
  try {
    // get aws credentials and parse provider options
    if (providerOptions.awsAuthType === 'assumedRole') {
      await providerAssumedRoleCredentials(c, providerOptions);
    }
    const { awsRegion, awsS3Bucket, awsBedrockModel } = providerOptions;

    const awsS3ObjectKey =
      providerOptions.awsS3ObjectKey || crypto.randomUUID() + '.jsonl';

    if (!awsS3Bucket || !awsBedrockModel) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message:
            'Please make sure you have x-portkey-aws-s3-bucket and x-portkey-aws-bedrock-model headers provided.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }

    const handler = new AwsMultipartUploadHandler(
      awsRegion,
      awsS3Bucket,
      awsS3ObjectKey,
      providerOptions,
      c
    );

    const purpose = c.req.header(`x-${POWERED_BY}-file-purpose`) ?? 'batch';
    const modelType = requestHeaders[`x-${POWERED_BY}-model-type`];

    if (!awsBedrockModel || !awsS3Bucket)
      throw new Error(
        'awsBedrockModel and awsS3Bucket are required to upload a file'
      );

    // upload file to s3
    await handler.initiateMultipartUpload();
    await handler.chunkAndUploadStream(
      awsBedrockModel,
      requestBody,
      requestHeaders,
      purpose,
      modelType
    );
    await handler.completeMultipartUpload();

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
