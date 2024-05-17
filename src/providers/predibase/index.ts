import { ProviderConfigs } from '../types';
import PredibaseAPIConfig from './api';
import {
  PredibaseChatCompleteConfig,
  PredibaseChatCompleteResponseTransform,
} from './chatComplete';

const PredibaseConfig: ProviderConfigs = {
  chatComplete: PredibaseChatCompleteConfig,
  api: PredibaseAPIConfig,
  responseTransforms: {
    chatComplete: PredibaseChatCompleteResponseTransform,
  },
};

export default PredibaseConfig;
