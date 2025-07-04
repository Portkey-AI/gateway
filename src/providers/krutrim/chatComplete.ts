import { ChatCompletionResponse, ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';
import { KRUTRIM } from '../../globals';

interface KrutrimChatCompleteResponse extends ChatCompletionResponse {}
interface KrutrimChatCompleteErrorResponse extends ErrorResponse {
  'html-message'?: string;
}
export const KrutrimChatCompleteResponseTransform: (
  response: KrutrimChatCompleteResponse | KrutrimChatCompleteErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'html-message' in response) {
    // Handle Krutrim's error format
    return generateErrorResponse(
      {
        message: response['html-message'] ?? '',
        type: 'error',
        param: null,
        code: String(responseStatus),
      },
      KRUTRIM
    );
  }

  // Success case - add provider info
  Object.defineProperty(response, 'provider', {
    value: KRUTRIM,
    enumerable: true,
  });

  return response as ChatCompletionResponse;
};
