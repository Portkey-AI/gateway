import { ProviderConfigs } from '../types';
import CaymanAIAPIConfig from './api';
import {
  OpenAIChatCompleteConfig,
  OpenAIChatCompleteResponseTransform,
} from '../openai/chatComplete';
import {
  OpenAICompleteConfig,
  OpenAICompleteResponseTransform,
} from '../openai/complete';

const CaymanAIConfig: ProviderConfigs = {
  api: CaymanAIAPIConfig,
  chatComplete: OpenAIChatCompleteConfig,
  complete: OpenAICompleteConfig,
  responseTransforms: {
    chatComplete: OpenAIChatCompleteResponseTransform,
    complete: OpenAICompleteResponseTransform,
  },
};

export default CaymanAIConfig;
