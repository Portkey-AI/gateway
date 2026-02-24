import { fireworksDatasetToOpenAIFile } from './utils';

export const FireworksFileRetrieveResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus === 200) {
    return fireworksDatasetToOpenAIFile(response);
  }
  return response;
};
