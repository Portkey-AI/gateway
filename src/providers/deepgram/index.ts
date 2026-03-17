import { ProviderConfigs } from '../types';
import DeepgramAPIConfig from './api';
import {
  DeepgramCreateSpeechConfig,
  DeepgramCreateSpeechResponseTransform,
} from './createSpeech';
import {
  DeepgramCreateTranscriptionConfig,
  DeepgramCreateTranscriptionRequestHandler,
  DeepgramCreateTranscriptionResponseTransform,
} from './createTranscription';

const DeepgramConfig: ProviderConfigs = {
  api: DeepgramAPIConfig,
  createSpeech: DeepgramCreateSpeechConfig,
  createTranscription: DeepgramCreateTranscriptionConfig,
  requestHandlers: {
    createTranscription: DeepgramCreateTranscriptionRequestHandler,
  },
  responseTransforms: {
    createSpeech: DeepgramCreateSpeechResponseTransform,
    createTranscription: DeepgramCreateTranscriptionResponseTransform,
  },
};

export default DeepgramConfig;
