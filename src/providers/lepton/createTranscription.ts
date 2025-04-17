import { LEPTON } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const LeptonCreateTranscriptionConfig: ProviderConfig = {
  file: {
    param: 'file',
    required: true,
  },
  model: {
    param: 'model',
    default: 'whisper-1',
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
    min: 0,
    max: 1,
    default: 0,
  },
  timestamp_granularities: {
    param: 'timestamp_granularities',
  },
  vad_filter: {
    param: 'vad_filter',
    default: false,
  },
  audio_enhance: {
    param: 'audio_enhance',
    default: false,
  },
  hallucination_silence_threshold: {
    param: 'hallucination_silence_threshold',
  },
};

export const LeptonCreateTranscriptionResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, LEPTON);
  }

  Object.defineProperty(response, 'provider', {
    value: LEPTON,
    enumerable: true,
  });

  return response;
};
