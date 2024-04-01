import { ProviderConfigs } from '../types';
import MonsterAPIApiConfig from './api';
import {
  MonsterAPIChatCompleteConfig,
  MonsterAPIChatCompleteResponseTransform,
} from './generate';

const MonsterAPIConfig: ProviderConfigs = {
  api: MonsterAPIApiConfig,
  generate: MonsterAPIChatCompleteConfig,
  responseTransforms: {
    generate: MonsterAPIChatCompleteResponseTransform,
  },
};

export default MonsterAPIConfig;
