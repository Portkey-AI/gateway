import { GoogleFinetuneRecord } from './types';
import { GoogleToOpenAIFinetune } from './utils';

export const GoogleFinetuneRetrieveResponseTransform = (
  response: Response,
  status: number
) => {
  if (status !== 200) {
    return response;
  }

  return GoogleToOpenAIFinetune(response as unknown as GoogleFinetuneRecord);
};
