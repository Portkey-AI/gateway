export const PortkeyBatchRequestRowTransform = (row: Record<string, any>) => {
  return row;
};

export const PortkeyUploadFileRequestTransform = (
  requestBody: ReadableStream
) => {
  return requestBody;
};
