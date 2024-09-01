import { ProviderConfigs } from '../types';
import SambaNovaAPIConfig from './api';
import {
  SamvaNovaChatCompleteConfig,
  SamvaNovaChatCompleteStreamChunkTransform,
} from './chatComplete';

const SambaNovaConfig: ProviderConfigs = {
  chatComplete: SamvaNovaChatCompleteConfig,
  api: SambaNovaAPIConfig,
  responseTransforms: {
    'stream-chatComplete': SamvaNovaChatCompleteStreamChunkTransform,
  },
};

export default SambaNovaConfig;
