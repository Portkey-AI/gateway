import { ASTRAFLOW } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AstraflowAPIConfig from './api';

const AstraflowConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {}),
  complete: completeParams([], {}),
  embed: embedParams([], {}),
  api: AstraflowAPIConfig,
  responseTransforms: responseTransformers(ASTRAFLOW, {
    chatComplete: true,
    complete: true,
    embed: true,
  }),
};

export default AstraflowConfig;
