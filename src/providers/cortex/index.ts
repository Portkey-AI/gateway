import { ProviderConfigs } from '../types';
import CortexAPIConfig from './api';
import {
  CortexChatCompleteConfig,
  CortexChatCompleteResponseTransform,
  CortexErrorResponseTransform,
} from './chatComplete';

const CortexConfig: ProviderConfigs = {
  chatComplete: CortexChatCompleteConfig,
  api: CortexAPIConfig,
  responseTransforms: {
    chatComplete: CortexChatCompleteResponseTransform,
  },
  errorResponseTransform: CortexErrorResponseTransform,
};

export default CortexConfig;
