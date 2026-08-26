import { VALAR } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';

/**
 * Valar mirrors the OpenAI response bodies on the files and batches surfaces,
 * so a successful response passes straight through and only errors need to be
 * re-stamped with this provider's name.
 */
export const ValarResponseTransform = <T extends object>(
  response: T | ErrorResponse,
  responseStatus: number
): T | ErrorResponse => {
  if (responseStatus !== 200 && response && 'error' in response) {
    return OpenAIErrorResponseTransform(response as ErrorResponse, VALAR);
  }

  return response;
};
