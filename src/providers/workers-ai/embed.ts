import { WORKERS_AI } from '../../globals';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  WorkersAiErrorResponse,
  WorkersAiErrorResponseTransform,
} from './utils';

export const WorkersAiEmbedConfig: ProviderConfig = {
  input: {
    param: 'text',
    required: true,
    transform: (params: EmbedParams): string[] => {
      if (Array.isArray(params.input)) {
        return params.input as string[];
      } else {
        return [params.input];
      }
    },
  },
};

/**
 * The structure of the CohereEmbedResponse.
 * @interface
 */
export interface WorkersAiEmbedResponse {
  result: {
    /** An array of strings which were the input texts to be embedded. */
    shape: number[];

    /** A 2D array of floating point numbers representing the embeddings. */
    data: number[][];
  };
}

export const WorkersAiEmbedResponseTransform: (
  response: WorkersAiEmbedResponse | WorkersAiErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  _strictOpenAiCompliance: boolean,
  _gatewayRequestUrl: string,
  gatewayRequest: Params
) => EmbedResponse | ErrorResponse = (
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

  const model = (gatewayRequest.model as string) || '';
  if ('result' in response) {
    return {
      object: 'list',
      data: response.result.data.map((embedding, index) => ({
        object: 'embedding',
        embedding: embedding,
        index: index,
      })),
      model,
      usage: {
        prompt_tokens: -1,
        total_tokens: -1,
      },
    };
  }

  return generateInvalidProviderResponseError(response, WORKERS_AI);
};
