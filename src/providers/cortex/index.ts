import { ProviderConfigs } from '../types';
import CortexAPIConfig from './api';
import { CORTEX } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';

const CortexConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'mistral-large' }),
  complete: completeParams([], { model: 'mistral-large' }),
  embed: embedParams([], { model: 'mistral-large' }),
  api: CortexAPIConfig,
  responseTransforms: responseTransformers(CORTEX, {
    chatComplete: true,
  }),
};

export default CortexConfig;
