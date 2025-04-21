import { ProviderConfigs } from '../types';
import LeptonAPIConfig from './api';
import {
  LeptonChatCompleteConfig,
  LeptonChatCompleteResponseTransform,
  LeptonChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  LeptonCompleteConfig,
  LeptonCompleteResponseTransform,
  LeptonCompleteStreamChunkTransform,
} from './complete';
import { LeptonCreateTranscriptionResponseTransform } from './createTranscription';

const LeptonConfig: ProviderConfigs = {
  chatComplete: LeptonChatCompleteConfig,
  complete: LeptonCompleteConfig,
  createTranscription: {},
  api: LeptonAPIConfig,
  responseTransforms: {
    chatComplete: LeptonChatCompleteResponseTransform,
    'stream-chatComplete': LeptonChatCompleteStreamChunkTransform,
    complete: LeptonCompleteResponseTransform,
    'stream-complete': LeptonCompleteStreamChunkTransform,
    createTranscription: LeptonCreateTranscriptionResponseTransform,
  },
};

export default LeptonConfig;
