import { Transform } from 'node:stream';
/**
 * Returns the boundary from the content-type header of a multipart/form-data request.
 * @param contentType - The content-type header of the original request.
 * @returns The boundary string.
 * @throws {Error} Throws an error if no boundary is found in the content-type header.
 */
export const getBoundaryFromContentType = (
  contentType: string | null
): string => {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('No boundary in content-type');
  return match[1] || match[2];
};

/**
 * Transforms the key of the current field in the multipart/form-data request body using the fieldsMapping.
 * @param headers - The headers of the current multipart/form-data field.
 * @param fieldsMapping - The mapping of the fields.
 * @returns The transformed headers.
 */
const transformHeaders = (
  headers: string,
  fieldsMapping: Record<string, string>
) => {
  const field = Object.keys(fieldsMapping).find((key) =>
    headers.includes(`name="${key}"`)
  );
  if (!field) return headers;
  return headers.replace(`name="${field}"`, `name="${fieldsMapping[field]}"`);
};

/**
 * Enqueues the value of the current field in the multipart/form-data request body.
 * (This currently does not transform the value)
 * @param chunk - The current chunk of the multipart/form-data body.
 * @param controller - The controller for the TransformStream.
 * @param buffer - The buffer to be updated.
 * @returns The updated buffer.
 */
const enqueueFieldValueAndUpdateBuffer = (
  chunk: string,
  controller: TransformStreamDefaultController,
  buffer: string
) => {
  controller.enqueue(new TextEncoder().encode(chunk));
  return buffer.slice(chunk.length);
};

/**
 * Enqueues the file content and updates the buffer for each jsonl row in the multipart/form-data body.
 * @param chunk - The current chunk of the multipart/form-data body.
 * @param controller - The controller for the TransformStream.
 * @param buffer - The buffer to be updated.
 * @param rowTransform - The function used to transform the row.
 * @returns The updated buffer.
 */
const enqueueFileContentAndUpdateBuffer = (
  chunk: string,
  controller: TransformStreamDefaultController,
  buffer: string,
  rowTransform: (row: Record<string, any>) => Record<string, any>
) => {
  const jsonLines = chunk.split('\n');
  for (const line of jsonLines) {
    if (line === '\r') {
      buffer = buffer.slice(line.length + 1);
      continue;
    }
    try {
      const json = JSON.parse(line);
      const transformedLine = rowTransform(json);
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

/**
 * Enqueues the file content and updates the buffer for each jsonl row in the multipart/form-data body.
 * @param chunk - The current chunk of the multipart/form-data body.
 * @param controller - The controller for the TransformStream.
 * @param buffer - The buffer to be updated.
 * @param rowTransform - The function used to transform the row.
 * @returns The updated buffer.
 */
const enqueueFileContentAndUpdateOctetStreamBuffer = (
  controller: TransformStreamDefaultController,
  buffer: string,
  rowTransform: (row: Record<string, any>) => Record<string, any>
) => {
  const jsonLines = buffer.split('\n');
  for (const line of jsonLines) {
    if (line === '\r') {
      buffer = buffer.slice(line.length + 1);
      continue;
    }
    try {
      const json = JSON.parse(line);
      const transformedLine = rowTransform(json);
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

/**
 * Returns an instance of TransformStream used for transforming a multipart/form-data
 * @param requestHeaders - The headers of the original request.
 * @param rowTransform - The function used to transform the row.
 * @returns An instance of TransformStream.
 */
export const getFormdataToFormdataStreamTransformer = (
  requestHeaders: Record<string, string>,
  rowTransform: (row: Record<string, any>) => Record<string, any>,
  fieldsMapping: Record<string, string>
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
          currentHeaders += buffer.slice(boundaryEndIndex, headersEndIndex);
          isFileContent = currentHeaders.includes(
            'Content-Disposition: form-data; name="file"'
          );
          // this will be specific to provider supported fields
          isValidField = currentHeaders.includes(
            'Content-Disposition: form-data; name="file"'
          );
          if (isValidField) {
            const transformedHeaders = transformHeaders(
              currentHeaders,
              fieldsMapping
            );
            controller.enqueue(encoder.encode(newBoundary + '\r\n'));
            controller.enqueue(encoder.encode(transformedHeaders + '\r\n\r\n'));
          }

          buffer = buffer.slice(headersEndIndex + 4);
          isParsingHeaders = false;
        }

        const boundaryIndex = buffer.indexOf(boundary);

        const safeLength = boundaryIndex ?? buffer.length;

        const content = buffer.slice(0, safeLength);
        if (isFileContent) {
          buffer = enqueueFileContentAndUpdateBuffer(
            content,
            controller,
            buffer,
            rowTransform
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
  return transformStream;
};

/**
 * Returns an instance of TransformStream used for transforming a binary/octet-stream
 * @param rowTransform - The function used to transform the row.
 * @returns An instance of TransformStream.
 */
export const getOctetStreamToOctetStreamTransformer = (
  rowTransform: (row: Record<string, any>) => Record<string, any>
) => {
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(new Uint8Array(chunk), { stream: true });

      buffer = enqueueFileContentAndUpdateOctetStreamBuffer(
        controller,
        buffer,
        rowTransform
      );
    },
  });
  return transformStream;
};

export const formDataToOctetStreamTransformer = (
  requestHeaders: Record<string, string>,
  rowTransform: (row: Record<string, any>) => Record<string, any>
) => {
  const decoder = new TextDecoder();
  const boundary =
    '--' + getBoundaryFromContentType(requestHeaders['content-type']);
  requestHeaders['content-type'] = `application/octet-stream`;
  let buffer = '';
  let isParsingHeaders = true;
  let currentHeaders = '';
  let isFileContent = false;

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
            buffer,
            rowTransform
          );
        } else {
          buffer = buffer.slice(safeLength);
        }

        if (buffer.startsWith(`${boundary}--`)) {
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
  return transformStream;
};

const decoder = new TextDecoder();

export function createLineSplitter(): TransformStream {
  let leftover = '';
  return new TransformStream({
    transform(_chunk, controller) {
      const chunk = decoder.decode(_chunk);
      leftover += chunk.toString();
      const lines = leftover.split('\n');
      leftover = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          controller.enqueue(line);
        }
      }
      return;
    },
    flush(controller) {
      if (leftover.trim()) {
        controller.enqueue(leftover);
      }
    },
  });
}
