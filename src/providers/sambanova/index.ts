import { chatCompleteParams } from '../open-ai-base';
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
      stream: true,
    }
  ),
  api: SambaNovaAPIConfig,
  responseTransforms: {
    'stream-chatComplete': SambaNovaChatCompleteStreamChunkTransform,
  },
};

export default SambaNovaConfig;
