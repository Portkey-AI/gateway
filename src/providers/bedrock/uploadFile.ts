export const BedrockUploadFileRequestTransform = (
  requestBody: ReadableStream,
  requestHeaders: Record<string, string>
) => {
  return requestBody;
};

export const BedrockUploadFileResponseTransform = (
  response: any,
  responseStatus: number
) => {
  return response;
};
