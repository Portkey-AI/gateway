import { ProviderConfigs } from '../types';
import CortexAPIConfig from './api';
import {
  CortexChatCompleteConfig,
  CortexChatCompleteResponseTransform,
} from './chatComplete';

const CortexConfig: ProviderConfigs = {
  chatComplete: CortexChatCompleteConfig,
  api: CortexAPIConfig,
  responseTransforms: {
    chatComplete: CortexChatCompleteResponseTransform,
  },
};

export default CortexConfig;
