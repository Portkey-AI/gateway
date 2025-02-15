import { FireworksFile } from './types';
import { fireworksDatasetToOpenAIFile } from './utils';

export const FireworksFileRetrieveResponseTransform = (
  response: FireworksFile,
  responseStatus: number
) => {
  if (responseStatus === 200) {
    return fireworksDatasetToOpenAIFile(response);
  }
  return response;
};
