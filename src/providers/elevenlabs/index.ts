import { ProviderConfigs } from '../types';
import ElevenLabsAPIConfig from './api';
import {
  ElevenLabsCreateSpeechConfig,
  ElevenLabsCreateSpeechResponseTransform,
} from './createSpeech';
import {
  ElevenLabsCreateTranscriptionConfig,
  ElevenLabsCreateTranscriptionResponseTransform,
} from './createTranscription';

const ElevenLabsConfig: ProviderConfigs = {
  api: ElevenLabsAPIConfig,
  createSpeech: ElevenLabsCreateSpeechConfig,
  createTranscription: ElevenLabsCreateTranscriptionConfig,
  responseTransforms: {
    createSpeech: ElevenLabsCreateSpeechResponseTransform,
    createTranscription: ElevenLabsCreateTranscriptionResponseTransform,
  },
};

export default ElevenLabsConfig;
