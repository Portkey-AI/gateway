import { ProviderConfigs } from '../types';
import {
  HyperfusionCompleteConfig,
  HyperfusionCompleteResponseTransform,
} from './complete';
import { HyperfusionEmbedConfig, HyperfusionEmbedResponseTransform } from './embed';
import HyperfusionAPIConfig from './api';
import {
  HyperfusionChatCompleteConfig,
  HyperfusionChatCompleteResponseTransform,
} from './chatComplete';
import {
  HyperfusionCreateSpeechConfig,
  HyperfusionCreateSpeechResponseTransform,
} from './createSpeech';
import {
  HyperfusionCreateTranscriptionConfig,
  HyperfusionCreateTranscriptionResponseTransform
} from './createTranscription';
import { HYPERFUSION } from '../../globals';
import {
  HyperfusionErrorResponseTransform,
  createHyperfusionErrorResponse,
  handleHyperfusionErrorResponse,
  handleMalformedResponse,
  handleUnexpectedError,
  transformHyperfusionResponse,
  logResponseDetails,
  isValidResponse
} from './utils';

const HyperfusionConfig: ProviderConfigs = {
  complete: HyperfusionCompleteConfig,
  embed: HyperfusionEmbedConfig,
  api: HyperfusionAPIConfig,
  chatComplete: HyperfusionChatCompleteConfig,
  createSpeech: HyperfusionCreateSpeechConfig,
  createTranscription: HyperfusionCreateTranscriptionConfig,
  responseTransforms: {
    complete: HyperfusionCompleteResponseTransform,
    chatComplete: HyperfusionChatCompleteResponseTransform,
    embed: HyperfusionEmbedResponseTransform,
    createSpeech: HyperfusionCreateSpeechResponseTransform,
    createTranscription: HyperfusionCreateTranscriptionResponseTransform,
  },
};

export default HyperfusionConfig;