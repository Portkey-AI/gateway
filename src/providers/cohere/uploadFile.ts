import { COHERE } from '../../globals';
import { ErrorResponse, UploadFileResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

interface CohereCreateDatasetResponse {
  id: string;
}

const getBoundaryFromContentType = (contentType: string | null): string => {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('No boundary in content-type');
  return match[1] || match[2];
};

// provider specific headers field key transformation
const transformHeaders = (headers: string) => {
  return headers;
};

const enqueueFieldValueAndUpdateBuffer = (
  chunk: string,
  controller: TransformStreamDefaultController,
  buffer: string
) => {
  controller.enqueue(new TextEncoder().encode(chunk));
  return buffer.slice(chunk.length);
};

const enqueueFileContentAndUpdateBuffer = (
  chunk: string,
  controller: TransformStreamDefaultController,
  buffer: string
) => {
  const jsonLines = chunk.split('\n');
  for (const line of jsonLines) {
    if (line === '\r') {
      buffer = buffer.slice(line.length + 1);
      continue;
    }
    try {
      const json = JSON.parse(line);
      const transformedLine = { text: json.body.input };
      controller.enqueue(
        new TextEncoder().encode(JSON.stringify(transformedLine))
      );
      controller.enqueue(new TextEncoder().encode('\r\n'));
      buffer = buffer.slice(line.length + 1);
    } catch (error) {
      // this is not a valid json line, so we don't update the buffer
    }
  }
  return buffer;
};

const setExtraFields = (controller: TransformStreamDefaultController) => {};

export const CohereUploadFileRequestTransform = (
  requestBody: ReadableStream,
  requestHeaders: Record<string, string>
) => {
  const decoder = new TextDecoder();
  const boundary =
    '--' + getBoundaryFromContentType(requestHeaders['content-type']);
  const newBoundary =
    '------FormBoundary' + Math.random().toString(36).slice(2);
  requestHeaders['content-type'] =
    `multipart/form-data; boundary=${newBoundary.slice(2)}`;
  let buffer = '';
  let isParsingHeaders = true;
  let currentHeaders = '';
  let isFileContent = false;
  const encoder = new TextEncoder();
  let isValidField = true;

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      while (buffer.length > 0) {
        if (isParsingHeaders) {
          const headersEndIndex = buffer.indexOf('\r\n\r\n');
          const boundaryEndIndex =
            buffer.indexOf(boundary) + boundary.length + 2;
          // if (headersEndIndex < 0) break;
          currentHeaders += buffer.slice(boundaryEndIndex, headersEndIndex);
          isFileContent = currentHeaders.includes(
            'Content-Disposition: form-data; name="file"'
          );
          // this will be specific to provider supported fields
          isValidField = currentHeaders.includes(
            'Content-Disposition: form-data; name="file"'
          );
          if (isValidField) {
            const transformedHeaders = transformHeaders(currentHeaders);
            controller.enqueue(encoder.encode(newBoundary + '\r\n'));
            controller.enqueue(encoder.encode(transformedHeaders + '\r\n\r\n'));
          }

          buffer = buffer.slice(headersEndIndex + 4);
          isParsingHeaders = false;
        }

        const boundaryIndex = buffer.indexOf(boundary);

        const safeLength = boundaryIndex ?? buffer.length;
        // if (safeLength <= 0) break;

        const content = buffer.slice(0, safeLength);
        if (isFileContent) {
          buffer = enqueueFileContentAndUpdateBuffer(
            content,
            controller,
            buffer
          );
        } else if (isValidField) {
          buffer = enqueueFieldValueAndUpdateBuffer(
            content,
            controller,
            buffer
          );
        } else {
          buffer = buffer.slice(safeLength);
        }

        if (buffer.startsWith(`${boundary}--`)) {
          controller.enqueue(new TextEncoder().encode(`\r\n${newBoundary}--`));
          buffer = '';
        } else if (buffer.startsWith(boundary)) {
          isParsingHeaders = true;
          currentHeaders = '';
        } else {
          break;
        }
      }
    },
  });

  return requestBody.pipeThrough(transformStream);
};

export const CohereUploadFileResponseTransform: (
  response: CohereCreateDatasetResponse | CohereErrorResponse,
  responseStatus: number
) => UploadFileResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  } else if ('id' in response) {
    return {
      id: response.id,
      object: 'file',
      bytes: 0,
      created_at: Math.floor(Date.now() / 1000),
      filename: '',
      purpose: '',
    };
  }
  return generateInvalidProviderResponseError(response, COHERE);
};
