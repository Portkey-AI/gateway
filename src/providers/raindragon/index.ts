import { RAINDRAGON } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import RaindragonAPIConfig from './api';

const RaindragonConfig: ProviderConfigs = {
  api: RaindragonAPIConfig,
  chatComplete: chatCompleteParams(
    [],
    { model: 'google/gemma-4-26B-A4B-it' },
    {
      // Gemma 4 thinking toggle: { enable_thinking: true }
      chat_template_kwargs: {
        param: 'chat_template_kwargs',
      },
    }
  ),
  responseTransforms: responseTransformers(RAINDRAGON, {
    chatComplete: true,
  }),
};

export default RaindragonConfig;
