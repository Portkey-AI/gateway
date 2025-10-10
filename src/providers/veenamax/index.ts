import { ProviderConfigs } from '../types';
import VeenaMaxAPIConfig from './api';
import {
  VeenaMaxCreateSpeechConfig,
  VeenaMaxCreateSpeechResponseTransform,
} from './createSpeech';

const VeenaMaxConfig: ProviderConfigs = {
  api: VeenaMaxAPIConfig,
  createSpeech: VeenaMaxCreateSpeechConfig,
  responseTransforms: {
    createSpeech: VeenaMaxCreateSpeechResponseTransform,
  },
};

export default VeenaMaxConfig;
