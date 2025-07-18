import { HYPERFUSION } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  logResponseDetails,
  transformHyperfusionResponse
} from './utils';

export interface HyperfusionCreateSpeechResponse {
  model: string;
  object: string;
  created: number;
  audio_data: string; // Base64 encoded audio data
}

export const HyperfusionCreateSpeechConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  input: {
    param: 'input',
    required: true,
  },
  voice: {
    param: 'voice',
    required: true,
    default: 'alloy',
  },
  response_format: {
    param: 'response_format',
    required: false,
    default: 'mp3',
  },
  speed: {
    param: 'speed',
    required: false,
    default: 1,
  },
};

export const HyperfusionCreateSpeechResponseTransform: (
  response: HyperfusionCreateSpeechResponse | ErrorResponse | any,
  responseStatus: number
) => HyperfusionCreateSpeechResponse | ErrorResponse = (response, responseStatus) => {
  // Log response details for debugging
  logResponseDetails('HyperfusionCreateSpeechResponseTransform', response, responseStatus);
  
  // Use the generic response transformer
  return transformHyperfusionResponse<HyperfusionCreateSpeechResponse>(response, responseStatus);
};