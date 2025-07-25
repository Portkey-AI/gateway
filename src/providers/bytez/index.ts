import { ProviderConfigs } from '../types';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig, chatComplete } from './chatComplete';

const BytezInferenceAPIConfig: ProviderConfigs = {
  api: BytezInferenceAPI,
  chatComplete: BytezInferenceChatCompleteConfig,
  responseTransforms: {
    chatComplete,
  },
};

export default BytezInferenceAPIConfig;
