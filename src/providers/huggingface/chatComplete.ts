import { HUGGING_FACE } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/chatComplete';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';

export const HuggingFaceChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
  },
  messages: {
    param: 'messages',
    default: '',
  },
  functions: {
    param: 'functions',
  },
  function_call: {
    param: 'function_call',
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
  logit_bias: {
    param: 'logit_bias',
  },
  user: {
    param: 'user',
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  response_format: {
    param: 'response_format',
  },
};

interface HuggingFaceChatCompleteResponse extends ChatCompletionResponse {}

export const HuggingFaceChatCompleteResponseTransform: (
  response: HuggingFaceChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, HUGGING_FACE);
  }

  return {
    ...response,
    id: 'portkey-' + crypto.randomUUID(),
  };
};

export const HuggingFaceChatCompleteStreamChunkTransform: (
  response: string
) => string | undefined = (responseChunk) => {
  let chunk = responseChunk.trim();
  if (chunk.startsWith('event: ping')) {
    return;
  }

  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return 'data: [DONE]\n\n';
  }
  const parsedChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      id: 'portkey-' + crypto.randomUUID(),
    })}` + '\n\n'
  );
};
