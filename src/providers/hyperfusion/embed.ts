import { HYPERFUSION } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  logResponseDetails,
  transformHyperfusionResponse
} from './utils';

export const HyperfusionEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  input: {
    param: 'input',
    required: true,
  },
  encoding_format: {
    param: 'encoding_format',
  },
  dimensions: {
    param: 'dimensions',
  },
  user: {
    param: 'user',
  },
};

export const HyperfusionEmbedResponseTransform: (
  response: EmbedResponse | ErrorResponse | any,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  // Log response details for debugging
  logResponseDetails('HyperfusionEmbedResponseTransform', response, responseStatus);
  
  // Use the generic response transformer
  return transformHyperfusionResponse<EmbedResponse>(response, responseStatus);
};