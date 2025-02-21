import { ErrorResponse } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockFinetuneRecord } from './types';
import { bedrockFinetuneToOpenAI } from './utils';

export const BedrockListFinetuneResponseTransform: (
  response: any | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return BedrockErrorResponseTransform(response) || response;
  }
  const records =
    response?.modelCustomizationJobSummaries as BedrockFinetuneRecord[];
  const openaiRecords = records.map(bedrockFinetuneToOpenAI);
  return {
    data: openaiRecords,
    object: 'list',
    total_count: openaiRecords.length,
    last_id: response?.nextToken,
  };
};
