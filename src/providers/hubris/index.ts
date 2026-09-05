import { HUBRIS } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { hubrisAPIConfig } from './api';

const HubrisConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], {
    model: 'anthropic/claude-sonnet-5',
  }),
  embed: embedParams([], { model: 'openai/text-embedding-3-small' }),
  api: hubrisAPIConfig,
  responseTransforms: responseTransformers(HUBRIS, {
    chatComplete: true,
    embed: true,
  }),
};

export default HubrisConfig;
