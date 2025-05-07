import { KLUSTER_AI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse, ProviderConfig } from '../types';

export const KlusterAIEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'klusterai/Meta-Llama-3.1-8B-Instruct-Turbo',
  },
  input: {
    param: 'input',
    required: true,
    default: '',
  },
};

interface KlusterAIEmbedResponse extends EmbedResponse {}

export const KlusterAIEmbedResponseTransform: (
  response: KlusterAIEmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, KLUSTER_AI);
  }

  return response;
};
