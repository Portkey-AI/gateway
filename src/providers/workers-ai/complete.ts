import { Params } from '../../types/requestBody';
import { CompletionResponse, ErrorResponse, ProviderConfig } from '../types';
import { WORKERS_AI } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';
import {
  WorkersAiErrorResponse,
  WorkersAiErrorResponseTransform,
} from './utils';

export const WorkersAiCompleteConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    transform: (params: Params) => `\n\nHuman: ${params.prompt}\n\nAssistant:`,
    required: true,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  raw: {
    param: 'raw',
  },
  max_tokens: {
    param: 'max_tokens',
  },
};

interface WorkersAiCompleteResponse {
  result: {
    response: string;
  };
  success: boolean;
  errors: string[];
  messages: string[];
}

interface WorkersAiCompleteStreamResponse {
  response: string;
  p?: string;
}

export const WorkersAiCompleteResponseTransform: (
  response: WorkersAiCompleteResponse | WorkersAiErrorResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => CompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  _strictOpenAiCompliance,
  _gatewayRequestUrl,
  gatewayRequest
) => {
  if (responseStatus !== 200) {
    const errorResponse = WorkersAiErrorResponseTransform(
      response as WorkersAiErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('result' in response) {
    return {
      id: Date.now().toString(),
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: WORKERS_AI,
      choices: [
        {
          text: response.result.response,
          index: 0,
          logprobs: null,
          finish_reason: '',
        },
      ],
    };
  }

  return generateInvalidProviderResponseError(response, WORKERS_AI);
};

export const WorkersAiCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  _streamState: Record<string, any>,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string | undefined = (
  responseChunk,
  fallbackId,
  _streamState,
  strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();

  if (chunk.startsWith('data: [DONE]')) {
    return 'data: [DONE]\n\n';
  }

  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  const parsedChunk: WorkersAiCompleteStreamResponse = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: WORKERS_AI,
      choices: [
        {
          text: parsedChunk.response,
          index: 0,
          logprobs: null,
          finish_reason: '',
        },
      ],
    })}` + '\n\n'
  );
};
