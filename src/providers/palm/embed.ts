import { PALM } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import {
  GoogleErrorResponse,
  GoogleErrorResponseTransform,
} from '../google/chatComplete';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const PalmEmbedConfig: ProviderConfig = {
  input: {
    param: 'text',
    required: true,
  },
  model: {
    param: 'model',
    default: 'models/embedding-gecko-001',
  },
};

interface embedding {
  value: number[];
}

interface PalmEmbedResponse {
  embedding: embedding;
}

export const PalmEmbedResponseTransform: (
  response: PalmEmbedResponse | GoogleErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  _strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
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
    const errorResponse = GoogleErrorResponseTransform(
      response as GoogleErrorResponse,
      PALM
    );
    if (errorResponse) return errorResponse;
  }

  const model = (gatewayRequest.model as string) || '';
  if ('embedding' in response) {
    return {
      object: 'list',
      data: [
        {
          object: 'embedding',
          embedding: response.embedding.value,
          index: 0,
        },
      ],
      model,
      usage: {
        prompt_tokens: -1,
        total_tokens: -1,
      },
      provider: PALM,
    };
  }

  return generateInvalidProviderResponseError(response, PALM);
};
