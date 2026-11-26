import { BF16 } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import BF16APIConfig from './api';
import {
  BF16ChatCompleteConfig,
  BF16ChatCompleteStreamChunkTransform,
} from './chatComplete';

const BF16Config: ProviderConfigs = {
  api: BF16APIConfig,
  chatComplete: BF16ChatCompleteConfig,
  responseTransforms: {
    ...responseTransformers(BF16, {
      chatComplete: true,
    }),
    'stream-chatComplete': BF16ChatCompleteStreamChunkTransform,
  },
};

export default BF16Config;
