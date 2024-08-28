import { ProviderConfigs } from '../types';
import SambaNovaAPIConfig from './api';
import {
  SamvaNovaChatCompleteConfig,
  SamvaNovaChatCompleteResponseTransform,
  SamvaNovaChatCompleteStreamChunkTransform,
} from './chatComplete';

const SambaNovaConfig: ProviderConfigs = {
  chatComplete: SamvaNovaChatCompleteConfig,
  api: SambaNovaAPIConfig,
  responseTransforms: {
    // todo: does not support non-stream request yet.
    // chatComplete: SamvaNovaChatCompleteResponseTransform,
    'stream-chatComplete': SamvaNovaChatCompleteStreamChunkTransform,
  },
};

export default SambaNovaConfig;
