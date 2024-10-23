import { ProviderConfigs } from '../types';
import LemonfoxAIAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { LemonfoxAIChatCompleteStreamChunkTransform } from './chatComplete';
import {
  LemonfoxAIImageGenerateConfig,
  LemonfoxImageGenerateResponseTransform,
} from './imageGenerate';

import {
  LemonfoxAICreateTranscriptionResponseTransform,
  LemonfoxAIcreateTranscriptionConfig,
} from './createTranscription';
import { LEMONFOX_AI } from '../../globals';

const LemonfoxAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'functions',
      'function_call',
      'n',
      'logit_bias',
      'user',
      'seed',
      'tools',
      'tool_choice',
      'response_format',
      'logprobs',
      'stream_options',
    ],
    {
      model: 'zephyr-chat',
    }
  ),
  imageGenerate: LemonfoxAIImageGenerateConfig,
  createTranscription: LemonfoxAIcreateTranscriptionConfig,
  api: LemonfoxAIAPIConfig,
  responseTransforms: {
    ...responseTransformers(LEMONFOX_AI, {
      chatComplete: (response, isError) => {
        if (isError || 'choices' in response === false) return response;

        return {
          ...response,
          provider: LEMONFOX_AI,
          choices: response.choices.map((choice) => ({
            ...choice,
            message: {
              role: 'assistant',
              ...(choice.message as any),
            },
          })),
          usage: {
            prompt_tokens: response.usage?.prompt_tokens || 0,
            completion_tokens: response.usage?.completion_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0,
          },
        };
      },
    }),
    'stream-chatComplete': LemonfoxAIChatCompleteStreamChunkTransform,
    imageGenerate: LemonfoxImageGenerateResponseTransform,
    createTranscription: LemonfoxAICreateTranscriptionResponseTransform,
  },
};

export default LemonfoxAIConfig;
