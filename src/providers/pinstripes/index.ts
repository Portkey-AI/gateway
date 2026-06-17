import { PINSTRIPES } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import PinstripesAPIConfig from './api';

const PinstripesConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'ps/qwen3.6-35b-a3b' }),
  complete: completeParams([], { model: 'ps/qwen3.6-35b-a3b' }),
  embed: embedParams([], {}),
  api: PinstripesAPIConfig,
  responseTransforms: responseTransformers(PINSTRIPES, {
    chatComplete: true,
    complete: true,
    embed: true,
  }),
};

export default PinstripesConfig;
