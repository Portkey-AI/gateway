import { INFERENCENET } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { inferenceAPIConfig } from './api';
import { InferenceNetChatCompleteStreamChunkTransform } from './chatComplete';

export const InferenceNetProviderConfigs: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'llama3' }),
  api: inferenceAPIConfig,
  responseTransforms: {
    ...responseTransformers(INFERENCENET, {
      chatComplete: true,
      complete: true,
    }),
    'stream-chatComplete': InferenceNetChatCompleteStreamChunkTransform,
  },
};
