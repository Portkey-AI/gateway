import { SALADCLOUD } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import SaladCloudAPIConfig from './api';
import {
  SaladCloudChatCompleteDefaults,
  SaladCloudChatCompleteExcludedParams,
  SaladCloudChatCompleteExtraParams,
} from './chatComplete';

const SaladCloudConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    SaladCloudChatCompleteExcludedParams,
    SaladCloudChatCompleteDefaults,
    SaladCloudChatCompleteExtraParams
  ),
  api: SaladCloudAPIConfig,
  responseTransforms: responseTransformers(SALADCLOUD, {
    chatComplete: true,
  }),
};

export default SaladCloudConfig;
