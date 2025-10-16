import { COMETAPI } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import CometAPIAPIConfig from './api';
import {
  CometAPIChatCompleteConfig,
  CometAPIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { CometAPIEmbedConfig } from './embed';

const CometAPIConfig: ProviderConfigs = {
  api: CometAPIAPIConfig,
  chatComplete: CometAPIChatCompleteConfig,
  embed: CometAPIEmbedConfig,
  responseTransforms: {
    ...responseTransformers(COMETAPI, {
      chatComplete: true,
      embed: true,
    }),
    'stream-chatComplete': CometAPIChatCompleteStreamChunkTransform,
  },
};

export default CometAPIConfig;
