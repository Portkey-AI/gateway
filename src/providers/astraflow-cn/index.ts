import { ASTRAFLOW_CN } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AstraflowCNAPIConfig from './api';

const AstraflowCNConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {}),
  complete: completeParams([], {}),
  embed: embedParams([], {}),
  api: AstraflowCNAPIConfig,
  responseTransforms: responseTransformers(ASTRAFLOW_CN, {
    chatComplete: true,
    complete: true,
    embed: true,
  }),
};

export default AstraflowCNConfig;
