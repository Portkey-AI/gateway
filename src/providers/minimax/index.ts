import { MINIMAX } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import MiniMaxAPIConfig from './api';
import { MiniMaxChatCompleteStreamChunkTransform } from './chatComplete';

const MiniMaxConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    ['logit_bias', 'logprobs', 'top_logprobs', 'parallel_tool_calls'],
    { temperature: 1 },
    {
      response_format: {
        param: 'response_format',
        default: null,
      },
    }
  ),
  api: MiniMaxAPIConfig,
  responseTransforms: {
    ...responseTransformers(MINIMAX, {
      chatComplete: true,
    }),
    'stream-chatComplete': MiniMaxChatCompleteStreamChunkTransform,
  },
};

export default MiniMaxConfig;
