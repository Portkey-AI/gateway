import { HYPERFUSION } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  logResponseDetails,
  transformHyperfusionResponse
} from './utils';

export interface HyperfusionCreateTranscriptionResponse {
  text: string;
  model: string;
  object: string;
  created: number;
  duration?: number;
  language?: string;
}

export const HyperfusionCreateTranscriptionConfig: ProviderConfig = {
  file: {
    param: 'file',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  language: {
    param: 'language',
  },
  prompt: {
    param: 'prompt',
  },
  response_format: {
    param: 'response_format',
    default: 'json',
  },
  temperature: {
    param: 'temperature',
    default: 0,
    min: 0,
    max: 1,
  },
};

export const HyperfusionCreateTranscriptionResponseTransform: (
  response: HyperfusionCreateTranscriptionResponse | ErrorResponse | any,
  responseStatus: number
) => HyperfusionCreateTranscriptionResponse | ErrorResponse = (response, responseStatus) => {
  // Log response details for debugging
  logResponseDetails('HyperfusionCreateTranscriptionResponseTransform', response, responseStatus);
  
  // Use the generic response transformer
  return transformHyperfusionResponse<HyperfusionCreateTranscriptionResponse>(response, responseStatus);
};