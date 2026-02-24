import { ProviderConfigs } from '../types';
import RekaAIApiConfig from './api';
import {
  RekaAIChatCompleteConfig,
  RekaAIChatCompleteResponseTransform,
} from './chatComplete';
import { RekaLogConfig } from './pricing';

const RekaAIConfig: ProviderConfigs = {
  chatComplete: RekaAIChatCompleteConfig,
  api: RekaAIApiConfig,
  responseTransforms: {
    chatComplete: RekaAIChatCompleteResponseTransform,
  },
  pricing: RekaLogConfig,
};

export default RekaAIConfig;
