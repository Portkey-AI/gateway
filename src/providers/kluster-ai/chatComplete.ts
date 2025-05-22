import { KLUSTER_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ChatCompletionResponse, ErrorResponse } from '../types';

// export const KlusterAIChatCompleteConfig: ProviderConfig = {
//   model: {
//     param: 'model',
//     required: true,
//     default: 'klusterai/Meta-Llama-3.1-8B-Instruct-Turbo',
//   },
//   messages: {
//     param: 'messages',
//     required: true,
//     default: '',
//   },
//   store: {
//     param: 'store',
//   },
//   metadata: {
//     param: 'metadata',
//     required: true,
//   },
//   temperature: {
//     param: 'temperature',
//     default: 1,
//     min: 0,
//     max: 2,
//   },
//   top_p: {
//     param: 'top_p',
//     default: 1,
//     min: 0,
//     max: 1,
//   },
//   max_tokens: {
//     param: 'max_tokens',
//     default: 100,
//     min: 0,
//   },
//   stream: {
//     param: 'stream',
//     default: false,
//   },
//   stop: {
//     param: 'stop',
//   },
//   n: {
//     param: 'n',
//     default: 1,
//   },
//   presence_penalty: {
//     param: 'presence_penalty',
//     min: -2,
//     max: 2,
//   },
//   frequency_penalty: {
//     param: 'frequency_penalty',
//     min: -2,
//     max: 2,
//   },
//   logit_bias: {
//     param: 'logit_bias',
//   },
//   user: {
//     param: 'user',
//   },
//   tools: {
//     param: 'tools',
//   },
//   tool_choice: {
//     param: 'tool_choice',
//   },
//   response_format: {
//     param: 'response_format',
//   },
//   seed: {
//     param: 'seed',
//   },
// };

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
