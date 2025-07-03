import { ProviderConfigs } from '../types';
import { X_AI } from '../../globals';
import XAIAPIConfig from './api';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';

const XAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'deepseek-v3-0324' }),
  complete: completeParams([], { model: 'deepseek-v3-0324' }),
  embed: embedParams([], { model: 'multilingual-e5-large-instruct' }),
  api: XAIAPIConfig,
  responseTransforms: responseTransformers(crofAI, {
    chatComplete: true,
    complete: true,
    embed: true,
  }),
};

export default crofAIConfig;
