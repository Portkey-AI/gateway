import { ProviderConfigs } from '../types';
import { KLUSTER_AI } from '../../globals';
import { responseTransformers } from '../open-ai-base';
import KlusterAIAPIConfig from './api';
import {
  KlusterAIChatCompleteConfig,
  KlusterAIResponseTransform,
} from './chatComplete';
import { KlusterAIEmbedConfig } from './embed';
import { KlusterAIRequestTransform } from './uploadFile';

const KlusterAIConfig: ProviderConfigs = {
  chatComplete: KlusterAIChatCompleteConfig,
  embed: KlusterAIEmbedConfig,
  api: KlusterAIAPIConfig,
  responseTransforms: {
    ...responseTransformers(KLUSTER_AI, {
      chatComplete: true,
      embed: true,
    }),
    uploadFile: KlusterAIResponseTransform,
  },
  requestTransforms: {
    uploadFile: KlusterAIRequestTransform,
  },
};

export default KlusterAIConfig;
