import { DEMONROUTE } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import DemonRouteAPIConfig from './api';

const DemonRouteConfig: ProviderConfigs = {
  api: DemonRouteAPIConfig,
  chatComplete: chatCompleteParams([], {
    model: 'shoukewei/Qwen3.8-27B-OBLITERATED22-AGENT',
  }),
  complete: completeParams([], {
    model: 'shoukewei/Qwen3.8-27B-OBLITERATED22-AGENT',
  }),
  responseTransforms: responseTransformers(DEMONROUTE, {
    chatComplete: true,
    complete: true,
  }),
};

export default DemonRouteConfig;
