import { ProviderConfigs } from '../types';
import AtomLLamaAPIConfig from './api';
import {
  AtomLLamaChatCompleteConfig,
  AtomLLamaChatCompleteResponseTransform,
  AtomLLamaChatCompleteStreamChunkTransform,
} from './chatComplete';

const AtomLLamaConfig: ProviderConfigs = {
  chatComplete: AtomLLamaChatCompleteConfig,
  api: AtomLLamaAPIConfig,
  responseTransforms: {
    chatComplete: AtomLLamaChatCompleteResponseTransform,
    'stream-chatComplete': AtomLLamaChatCompleteStreamChunkTransform,
  },
};

export default AtomLLamaConfig;
