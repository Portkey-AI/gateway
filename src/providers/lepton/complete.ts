import { LEPTON } from '../../globals';
import { CompletionResponse, ErrorResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

interface LeptonCompleteResponse extends CompletionResponse {}

export const LeptonCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  prompt: {
    param: 'prompt',
    required: true,
  },
  suffix: {
    param: 'suffix',
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 2,
  },
  n: {
    param: 'n',
    default: 1,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 256,
    min: 0,
  },
  stop: {
    param: 'stop',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stream_options: {
    param: 'stream_options',
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  logprobs: {
    param: 'logprobs',
  },
  echo: {
    param: 'echo',
    default: false,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: -2,
    max: 2,
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
  length_penalty: {
    param: 'length_penalty',
    default: 1,
  },
  repetition_penalty: {
    param: 'repetition_penalty',
    default: 1,
  },
  dry_multiplier: {
    param: 'dry_multiplier',
    default: 0,
  },
  dry_base: {
    param: 'dry_base',
    default: 1.75,
  },
  dry_allowed_length: {
    param: 'dry_allowed_length',
    default: 2,
  },
  do_early_stopping: {
    param: 'do_early_stopping',
    default: false,
  },
  beam_size: {
    param: 'beam_size',
    default: 1,
  },
  top_k: {
    param: 'top_k',
    default: 50,
  },
  min_p: {
    param: 'min_p',
    default: 0,
  },
  id: {
    param: 'id',
  },
  require_audio: {
    param: 'require_audio',
    default: false,
  },
  tts_preset_id: {
    param: 'tts_preset_id',
    default: 'jessica',
  },
  tts_audio_format: {
    param: 'tts_audio_format',
    default: 'mp3',
  },
  tts_audio_bitrate: {
    param: 'tts_audio_bitrate',
    default: 64,
  },
  audio_history_b64: {
    param: 'audio_history_b64',
  },
  for_quant_calibration: {
    param: 'for_quant_calibration',
    default: false,
  },
};

interface LeptonCompleteStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    text: string;
    index: number;
    logprobs: null;
    finish_reason: string | null;
  }[];
}

export const LeptonCompleteResponseTransform: (
  response: LeptonCompleteResponse | ErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, LEPTON);
  }

  Object.defineProperty(response, 'provider', {
    value: LEPTON,
    enumerable: true,
  });

  return response;
};

export const LeptonCompleteStreamChunkTransform = (responseChunk: string) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: LeptonCompleteStreamChunk = JSON.parse(chunk);
    return (
      `data: ${JSON.stringify({
        id: parsedChunk.id,
        object: parsedChunk.object,
        created: parsedChunk.created,
        model: parsedChunk.model,
        provider: LEPTON,
        choices: parsedChunk.choices.map((choice) => ({
          ...choice,
          finish_reason: choice.finish_reason || null,
        })),
      })}` + '\n\n'
    );
  } catch (error) {
    console.error('Error parsing Lepton stream chunk:', error);
    return `data: ${chunk}\n\n`;
  }
};
