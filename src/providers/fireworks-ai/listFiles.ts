import {
  FireworksAIErrorResponse,
  FireworksAIErrorResponseTransform,
  FireworksAIValidationErrorResponse,
} from './chatComplete';
import { FireworksFile } from './types';
import { fireworksDatasetToOpenAIFile } from './utils';

export const FireworksFileListResponseTransform = (
  response: (FireworksAIValidationErrorResponse | FireworksAIErrorResponse) & {
    datasets: FireworksFile[];
    totalSize: number;
  },
  responseStatus: number
) => {
  if (responseStatus === 200) {
    const datasets = response.datasets as FireworksFile[];
    const records = datasets.map(fireworksDatasetToOpenAIFile);
    return {
      object: 'list',
      data: records,
      last_id: records.at(-1)?.id,
      has_more: response.totalSize > response.datasets.length,
      total: response.totalSize,
    };
  }

  return FireworksAIErrorResponseTransform(response);
};
