import { ProviderConfigs } from '../types';
import EmpirioLabsAPIConfig from './api';
import { EmpirioLabsChatCompleteStreamChunkTransform } from './chatComplete';
import { EmpirioLabsEmbedConfig } from './embed';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { EMPIRIOLABS } from '../../globals';

const EmpirioLabsConfig: ProviderConfigs = {
  api: EmpirioLabsAPIConfig,
  chatComplete: chatCompleteParams([]),
  embed: EmpirioLabsEmbedConfig,
  responseTransforms: {
    ...responseTransformers(EMPIRIOLABS, {
      chatComplete: true,
      embed: true,
    }),
    'stream-chatComplete': EmpirioLabsChatCompleteStreamChunkTransform,
  },
};

export default EmpirioLabsConfig;
