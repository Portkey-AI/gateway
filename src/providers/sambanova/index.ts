import { SAMBANOVA } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import SambaNovaAPIConfig from './api';
import { SambaNovaChatCompleteStreamChunkTransform } from './chatComplete';

const SambaNovaConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'functions',
      'function_call',
      'presence_penalty',
      'frequency_penalty',
      'logit_bias',
      'user',
      'seed',
      'tools',
      'tool_choice',
      'response_format',
      'logprobs',
    ],
    {
      model: 'Meta-Llama-3.1-8B-Instruct',
    }
  ),
  api: SambaNovaAPIConfig,
  responseTransforms: {
    ...responseTransformers(SAMBANOVA, {
      chatComplete: (response, isError) => {
        if (isError || 'choices' in response === false) return response;

        return {
          ...response,
          provider: SAMBANOVA,
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
    'stream-chatComplete': SambaNovaChatCompleteStreamChunkTransform,
  },
};

export default SambaNovaConfig;
