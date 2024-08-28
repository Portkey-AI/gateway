import { ProviderConfigs } from '../types';
import {
  AzureAIInferenceCompleteConfig,
  AzureAIInferenceCompleteResponseTransform,
} from './complete';
import {
  AzureAIInferenceEmbedConfig,
  AzureAIInferenceEmbedResponseTransform,
} from './embed';
import AzureAIInferenceAPI from './api';
import {
  AzureAIInferenceChatCompleteConfig,
  AzureAIInferenceChatCompleteResponseTransform,
} from './chatComplete';
import { AZURE_AI_INFERENCE } from '../../globals';

const AzureAIInferenceAPIConfig: ProviderConfigs = {
  complete: AzureAIInferenceCompleteConfig,
  embed: AzureAIInferenceEmbedConfig,
  api: AzureAIInferenceAPI,
  chatComplete: AzureAIInferenceChatCompleteConfig,
  responseTransforms: {
    complete: AzureAIInferenceCompleteResponseTransform(AZURE_AI_INFERENCE),
    chatComplete:
      AzureAIInferenceChatCompleteResponseTransform(AZURE_AI_INFERENCE),
    embed: AzureAIInferenceEmbedResponseTransform(AZURE_AI_INFERENCE),
  },
};

export default AzureAIInferenceAPIConfig;
