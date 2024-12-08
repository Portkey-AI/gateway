/**
 * Returns the boundary from the content-type header of a multipart/form-data request.
 * @param contentType - The content-type header of the original request.
 * @returns The boundary string.
 * @throws {Error} Throws an error if no boundary is found in the content-type header.
 */
const getBoundaryFromContentType = (contentType: string | null): string => {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('No boundary in content-type');
  return match[1] || match[2];
};

/**
 * Updates the content-type header of the original request to use the new boundary.
 * @param requestHeaders - The headers of the original request.
 * @param newBoundary - The new boundary string to be used in the multipart/form-data request body.
 */
const updateContentType = (
  requestHeaders: Record<string, string>,
  newBoundary: string
) => {
  requestHeaders['content-type'] =
    `multipart/form-data; boundary=${newBoundary.slice(2)}`;
};

/**
 * Transforms the key of the current field in the multipart/form-data request body using the fieldsMapping.
 * @param currentHeaders - The headers of the current multipart/form-data field.
 * @param fieldsMapping - The mapping of the fields to be transformed.
 * @returns The transformed headers.
 */
const transformHeaders = (
  currentHeaders: string,
  fieldsMapping: Record<string, string>
) => {
  const field = Object.keys(fieldsMapping).find((key) =>
    currentHeaders.includes(`name="${key}"`)
  );
  if (!field) return currentHeaders;
  return currentHeaders.replace(
    `name="${field}"`,
    `name="${fieldsMapping[field]}"`
  );
};

/**
 * Checks if the current field in the multipart/form-data request body include any of the fields in the fieldsMapping.
 * @param currentHeaders - The headers of the current multipart/form-data field.
 * @param fieldsMapping - The mapping of the fields to be transformed.
 * @returns A boolean indicating if the current headers include any of the fields in the fieldsMapping.
 */
const checkIfFieldIsValid = (
  currentHeaders: string,
  fieldsMapping: Record<string, string>
) => {
  return Object.keys(fieldsMapping).some((key) =>
    currentHeaders.includes(`name="${key}"`)
  );
};

/**
 * Enqueues the file content and updates the buffer for each jsonl row in the multipart/form-data body.
 * @param chunk - The current chunk of the multipart/form-data body.
 * @param controller - The controller for the TransformStream.
 * @param buffer - The buffer to be updated.
 * @param rowTransform - The transformation function for each jsonl row in the multipart/form-data body.
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
 * Returns an instance of TransformStream used for transforming a multipart/form-data
 * @param requestHeaders - The headers of the original request.
 * @param fieldsMapping - The mapping of the fields to be transformed. (Used to tranform field key, not value)
 * @param rowTransform - The transformation function for each jsonl row in the multipart/form-data body.
 * @returns An instance of TransformStream.
 */
export const transformStream = (
  requestHeaders: Record<string, string>,
  fieldsMapping: Record<string, string>,
  rowTransform: (row: Record<string, any>) => Record<string, any>
) => {
  const newBoundary =
    '------FormBoundary' + Math.random().toString(36).slice(2);
  updateContentType(requestHeaders, newBoundary);
  const decoder = new TextDecoder();
  const boundary =
    '--' + getBoundaryFromContentType(requestHeaders['content-type']);
  let buffer = '';
  let isParsingHeaders = true;
  let currentHeaders = '';
  let isFileContent = false;
  const encoder = new TextEncoder();
  let isValidField = true;

  return new TransformStream({
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
          isValidField = checkIfFieldIsValid(currentHeaders, fieldsMapping);
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
        // if (safeLength <= 0) break;

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
};
