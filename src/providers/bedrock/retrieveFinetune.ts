import { ErrorResponse } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { bedrockFinetuneToOpenAI } from './utils';

export const BedrockFinetuneResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return BedrockErrorResponseTransform(response as any) || response;
  }

  return bedrockFinetuneToOpenAI(response as any) as any;
};
