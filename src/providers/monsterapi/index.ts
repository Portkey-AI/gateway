import { ProviderConfigs } from '../types';
import MonsterAPIApiConfig from './api';
import {
  MonsterAPIChatCompleteConfig,
  MonsterAPIChatCompleteResponseTransform,
} from './chatComplete';
import { MonsterAPILogConfig } from './pricing';

const MonsterAPIConfig: ProviderConfigs = {
  api: MonsterAPIApiConfig,
  chatComplete: MonsterAPIChatCompleteConfig,
  responseTransforms: {
    chatComplete: MonsterAPIChatCompleteResponseTransform,
  },
  pricing: MonsterAPILogConfig,
};

export default MonsterAPIConfig;
