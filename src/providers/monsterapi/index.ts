import { ProviderConfigs } from '../types';
import MonsterAPIApiConfig from './api';
import {
  MonsterAPIChatCompleteConfig,
  MonsterAPIChatCompleteResponseTransform,
} from './chatComplete'; // Change this line if file is renamed

const MonsterAPIConfig: ProviderConfigs = {
  api: MonsterAPIApiConfig,
  chatComplete: MonsterAPIChatCompleteConfig, // Changed from generate
  responseTransforms: {
    chatComplete: MonsterAPIChatCompleteResponseTransform, // Changed from generate
  },
};

export default MonsterAPIConfig;
