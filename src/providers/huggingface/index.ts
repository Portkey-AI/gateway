import { ProviderConfigs } from '../types';
import {
  HuggingFaceCompleteConfig,
  HuggingFaceCompleteResponseTransform,
} from './complete';
import HuggingFaceAPIConfig from './api';
import {
  HuggingFaceChatCompleteConfig,
  HuggingFaceChatCompleteResponseTransform,
} from './chatComplete';

const HuggingFaceConfig: ProviderConfigs = {
  complete: HuggingFaceCompleteConfig,
  api: HuggingFaceAPIConfig,
  chatComplete: HuggingFaceChatCompleteConfig,
  responseTransforms: {
    complete: HuggingFaceCompleteResponseTransform,
    chatComplete: HuggingFaceChatCompleteResponseTransform,
  },
};

export default HuggingFaceConfig;
