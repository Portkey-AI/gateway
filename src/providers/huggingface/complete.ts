import { HUGGING_FACE } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/chatComplete';
import { CompletionResponse, ErrorResponse, ProviderConfig } from '../types';

export const HuggingFaceCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
  },
  prompt: {
    param: 'prompt',
    default: '',
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: 'n',
    default: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  logprobs: {
    param: 'logprobs',
    max: 5,
  },
  echo: {
    param: 'echo',
    default: false,
  },
  stop: {
    param: 'stop',
  },
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
  },
  best_of: {
    param: 'best_of',
  },
  logit_bias: {
    param: 'logit_bias',
  },
  user: {
    param: 'user',
  },
};

interface HuggingFaceCompleteResponse extends CompletionResponse {}

export const HuggingFaceCompleteResponseTransform: (
  response: HuggingFaceCompleteResponse | ErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, HUGGING_FACE);
  }

  return response;
};
