import { HYPERFUSION } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  logResponseDetails,
  transformHyperfusionResponse
} from './utils';

export const HyperfusionChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    default: [],
    required: true,
    transform: (value: any) => {
      if (!Array.isArray(value)) {
        throw new Error('messages parameter must be an array');
      }
      if (value.length === 0) {
        throw new Error('messages array cannot be empty');
      }
      return value;
    },
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

export interface HyperfusionChatCompleteResponse extends ChatCompletionResponse {
  system_fingerprint: string;
}

export const HyperfusionChatCompleteResponseTransform: (
  response: HyperfusionChatCompleteResponse | ErrorResponse | any,
  responseStatus: number,
  responseHeaders?: Headers
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus, responseHeaders) => {
  // Log response details for debugging
  logResponseDetails('HyperfusionChatCompleteResponseTransform', response, responseStatus);
  
  // Use the generic response transformer
  return transformHyperfusionResponse<ChatCompletionResponse>(response, responseStatus);
};