import { Options } from '../../types/requestBody';

import crypto from 'node:crypto';
import { getBoundaryFromContentType } from '../../handlers/streamHandlerUtils';
import { BedrockUploadFileConfig } from './uploadFileUtils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { ProviderConfig } from '../../providers/types';

const unableToParseJsonResponse = () =>
  new Response(
    JSON.stringify({
      status: 'failure',
      message: 'Unable to parse json response',
    }),
    {
      status: 400,
      headers: {
        'content-type': 'application/json',
      },
    }
  );

class AwsMultipartUploadHandler {
  private bucket: string;
  private objectKey: string;
  private region: string;
  private uploadId?: string;
  private url: URL;
  private accessKeyId: string;
  private secretAccessKey: string;
  private parts: { PartNumber: number; ETag: string }[] = [];

  constructor(
    region: string = 'us-east-1',
    bucket: string = '',
    objectKey: string = '',
    accessKeyId: string = '',
    secretAccessKey: string = ''
  ) {
    this.region = region;
    this.bucket = bucket;
    this.objectKey = objectKey;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.url = new URL(
      `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}?uploads`
    );
  }

  // Helper to create HMAC
  hmac(key: Buffer | string, data: string) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  // Helper to create SHA256 hash
  sha256(data: string) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string
  ) {
    const kDate = this.hmac(`AWS4${key}`, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  async initiateMultipartUpload() {
    const method = 'POST';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // e.g., 20231210T000000Z
    const dateStamp = amzDate.slice(0, 8); // e.g., 20231210

    const headers: Record<string, string> = {
      Host: this.url.hostname,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', // Required for S3
    };

    // Step 1: Create Canonical Request
    const canonicalUri = `/${this.objectKey}`;
    const canonicalQueryString = 'uploads=';
    const signedHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort()
      .join(';');
    const canonicalHeaders = Object.entries(headers)
      .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
      .sort()
      .join('');
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Step 2: Create String to Sign
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    // Step 3: Calculate Signature
    const signingKey = this.getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      's3'
    );
    const signature = this.hmac(signingKey, stringToSign).toString('hex');

    // Step 4: Add Authorization Header
    headers['Authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    // Step 5: Send Request
    const response = await fetch(this.url.toString(), { method, headers });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error initiating multipart upload:', errorText);
      throw new Error(errorText);
    }

    const responseBody = await response.text();
    const uploadIdMatch = responseBody.match(/<UploadId>(.+?)<\/UploadId>/);
    if (!uploadIdMatch)
      throw new Error('Failed to parse UploadId from response');
    this.uploadId = uploadIdMatch[1];
    return uploadIdMatch[1];
  }

  async uploadPart(partNumber: number, partData: Uint8Array | Buffer) {
    if (!this.uploadId)
      throw new Error(
        'UploadId is not initialized. Call initiateMultipartUpload first.'
      );

    const method = 'PUT';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // e.g., 20231210T000000Z
    const dateStamp = amzDate.slice(0, 8); // e.g., 20231210

    const partUrl = new URL(
      `https://${this.bucket}.s3.${this.region}.amazonaws.com/${this.objectKey}?partNumber=${partNumber}&uploadId=${this.uploadId}`
    );

    const headers: Record<string, string> = {
      Host: partUrl.hostname,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': this.sha256(partData.toString()), // SHA256 of the part data
    };

    const canonicalRequest = [
      method,
      `/${this.objectKey}`,
      `partNumber=${partNumber}&uploadId=${this.uploadId}`,
      Object.entries(headers)
        .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
        .sort()
        .join(''),
      Object.keys(headers)
        .map((key) => key.toLowerCase())
        .sort()
        .join(';'),
      this.sha256(partData.toString()),
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      's3'
    );
    const signature = this.hmac(signingKey, stringToSign).toString('hex');

    headers['Authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${Object.keys(headers)
        .map((key) => key.toLowerCase())
        .sort()
        .join(';')}`,
      `Signature=${signature}`,
    ].join(', ');

    const response = await fetch(partUrl.toString(), {
      method,
      headers,
      body: partData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error uploading part ${partNumber}:`, errorText);
      throw new Error(errorText);
    }

    const eTag = response.headers.get('ETag');
    if (!eTag) throw new Error(`Missing ETag for part ${partNumber}`);

    this.parts.push({ PartNumber: partNumber, ETag: eTag });
  }

  async completeMultipartUpload() {
    if (!this.uploadId)
      throw new Error(
        'UploadId is not initialized. Call initiateMultipartUpload first.'
      );

    const method = 'POST';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

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
    const payloadHash = this.sha256(payload);

    const headers: Record<string, string> = {
      Host: completeUrl.hostname,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Content-Type': 'application/xml',
    };

    const canonicalRequest = [
      method,
      `/${this.objectKey}`,
      `uploadId=${this.uploadId}`,
      Object.entries(headers)
        .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
        .sort()
        .join(''),
      Object.keys(headers)
        .map((key) => key.toLowerCase())
        .sort()
        .join(';'),
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      's3'
    );
    const signature = this.hmac(signingKey, stringToSign).toString('hex');

    headers['Authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${Object.keys(headers)
        .map((key) => key.toLowerCase())
        .sort()
        .join(';')}`,
      `Signature=${signature}`,
    ].join(', ');

    const response = await fetch(completeUrl.toString(), {
      method,
      headers,
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error completing multipart upload:', errorText);
      throw new Error(errorText);
    }

    console.log('Multipart upload completed successfully.');
    return response;
  }
}

const transformAndUploadFileContentParts = async (
  chunk: string,
  buffer: string,
  providerConfig: ProviderConfig,
  handler: AwsMultipartUploadHandler,
  partNumber: number
) => {
  let transformedChunkToUpload = '';
  const jsonLines = chunk.split('\n');
  for (const line of jsonLines) {
    if (line === '\r') {
      buffer = buffer.slice(line.length + 1);
      continue;
    }
    try {
      const json = JSON.parse(line);
      const transformedLine = {
        recordId: json.custom_id,
        modelInput: transformUsingProviderConfig(providerConfig, json.body),
      };
      transformedChunkToUpload += JSON.stringify(transformedLine) + '\r\n';
      buffer = buffer.slice(line.length + 1);
    } catch (error) {
      // this is not a valid json line, so we don't update the buffer
    }
  }
  await handler.uploadPart(partNumber, Buffer.from(transformedChunkToUpload));
  return buffer;
};

const getProviderConfig = (provider: string) => {
  return BedrockUploadFileConfig[provider];
};

export const BedrockUploadFileRequestHandler = async ({
  providerOptions: providerOptions,
  requestBody,
  requestHeaders,
}: {
  providerOptions: Options;
  requestBody: ReadableStream;
  requestHeaders: Record<string, string>;
}) => {
  const {
    awsRegion,
    awsS3Bucket,
    awsS3ObjectKey,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsBedrockModel,
  } = providerOptions;
  const handler = new AwsMultipartUploadHandler(
    awsRegion,
    awsS3Bucket,
    awsS3ObjectKey,
    awsAccessKeyId,
    awsSecretAccessKey
  );

  if (!awsBedrockModel) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'awsBedrockModel is required',
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  await handler.initiateMultipartUpload();

  const providerConfig = getProviderConfig(awsBedrockModel.split('.')[0]);

  const reader = requestBody.getReader();
  let partNumber = 1;
  const decoder = new TextDecoder();
  const boundary =
    '--' + getBoundaryFromContentType(requestHeaders['content-type']);
  let currentChunk = '';
  let isParsingHeaders = true;
  let currentHeaders = '';
  let isFileContent = false;
  let contentLength = 0;

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
        currentHeaders += currentChunk.slice(boundaryEndIndex, headersEndIndex);
        isFileContent = currentHeaders.includes(
          'Content-Disposition: form-data; name="file"'
        );

        currentChunk = currentChunk.slice(headersEndIndex + 4);
        isParsingHeaders = false;
      }

      const boundaryIndex = currentChunk.indexOf(boundary);

      const safeLength = boundaryIndex ?? currentChunk.length;
      // if (safeLength <= 0) break;

      const content = currentChunk.slice(0, safeLength);
      if (isFileContent) {
        try {
          contentLength += content.length;
          currentChunk = await transformAndUploadFileContentParts(
            content,
            currentChunk,
            providerConfig,
            handler,
            partNumber
          );
          partNumber++;
        } catch (error) {
          return unableToParseJsonResponse();
        }
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

  await handler.completeMultipartUpload();
  const fileName = `${awsS3Bucket}/${awsS3ObjectKey}`;
  const s3Url = `s3://${fileName}`;
  const responseJson = {
    id: s3Url,
    object: 'file',
    created_at: Math.floor(Date.now() / 1000),
    filename: fileName, //TODO: get from request
    purpose: '',
    bytes: contentLength,
    status: 'uploaded',
    status_details: '',
  };

  return new Response(JSON.stringify(responseJson), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const BedrockUploadFileResponseTransform = (
  response: any,
  responseStatus: number
) => {
  return response;
};
