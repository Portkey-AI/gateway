import { GREENPT } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import GreenPTAPIConfig from './api';

const GreenPTConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'glm-5.2' }),
  embed: embedParams([], { model: 'green-embedding' }),
  api: GreenPTAPIConfig,
  responseTransforms: responseTransformers(GREENPT, {
    chatComplete: true,
    embed: true,
  }),
};

export default GreenPTConfig;
