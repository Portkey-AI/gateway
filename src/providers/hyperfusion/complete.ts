import { HYPERFUSION } from '../../globals';
import { CompletionResponse, ErrorResponse, ProviderConfig } from '../types';
import {
  logResponseDetails,
  transformHyperfusionResponse
} from './utils';

export const HyperfusionCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
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
  seed: {
    param: 'seed',
  },
  suffix: {
    param: 'suffix',
  },
};

export interface HyperfusionCompleteResponse extends CompletionResponse {
  system_fingerprint: string;
}

export const HyperfusionCompleteResponseTransform: (
  response: HyperfusionCompleteResponse | ErrorResponse | any,
  responseStatus: number,
  responseHeaders?: Headers
) => CompletionResponse | ErrorResponse = (response, responseStatus, responseHeaders) => {
  // Log response details for debugging
  logResponseDetails('HyperfusionCompleteResponseTransform', response, responseStatus);
  
  // Use the generic response transformer
  return transformHyperfusionResponse<CompletionResponse>(response, responseStatus);
};