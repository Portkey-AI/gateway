import { SARVAM } from '../../globals';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import SarvamAPIConfig from './api';
import {
  SarvamChatCompleteConfig,
  SarvamChatCompleteStreamChunkTransform,
} from './chatComplete';

// Sarvam's Responses API is stateless: only creating a response is supported.
// Retrieving or deleting a stored response is not, so those handlers are omitted.
const SarvamConfig: ProviderConfigs = {
  api: SarvamAPIConfig,
  chatComplete: SarvamChatCompleteConfig,
  createModelResponse: createModelResponseParams([]),
  responseTransforms: {
    ...responseTransformers(SARVAM, {
      chatComplete: true,
    }),
    'stream-chatComplete': SarvamChatCompleteStreamChunkTransform,
    createModelResponse: OpenAICreateModelResponseTransformer(SARVAM),
  },
};

export default SarvamConfig;
