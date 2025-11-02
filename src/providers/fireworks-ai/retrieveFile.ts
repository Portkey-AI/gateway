import { FireworksFile } from './type';
import { fireworksDatasetToOpenAIFile } from './util';

export const FireworksFileRetrieveResponseTransform = (
  response: FireworksFile,
  responseStatus: number
) => {
  if (responseStatus === 200) {
    return fireworksDatasetToOpenAIFile(response);
  }
  return response;
};
