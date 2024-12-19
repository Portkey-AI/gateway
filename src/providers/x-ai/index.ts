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
  chatComplete: chatCompleteParams([], { model: 'grok-beta' }),
  complete: completeParams([], { model: 'grok-beta' }),
  embed: embedParams([], { model: 'v1' }),
  api: XAIAPIConfig,
  responseTransforms: responseTransformers(X_AI, {
    chatComplete: true,
    complete: true,
    embed: true,
  }),
};

export default XAIConfig;
