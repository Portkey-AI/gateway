import { KLUSTER_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ChatCompletionResponse, ErrorResponse } from '../types';

interface KlusterAIChatCompleteResponse extends ChatCompletionResponse {}

export const KlusterAIResponseTransform: (
  response: KlusterAIChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, KLUSTER_AI);
  }

  return response;
};
