import { ProviderConfigs } from '../types';
import MartianAPIConfig from './api';
import {
  MartianChatCompleteConfig,
  MartianChatCompleteResponseTransform,
} from './chatComplete';

const MartianConfig: ProviderConfigs = {
  api: MartianAPIConfig,
  chatComplete: MartianChatCompleteConfig,
  responseTransforms: {
    chatComplete: MartianChatCompleteResponseTransform,
  },
};

// Explicit export for MartianConfig
export { MartianConfig };
export default MartianConfig;
