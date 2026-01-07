import { ProviderConfigs } from '../types';
import {
  OpenAICompleteConfig,
  OpenAICompleteResponseTransform,
} from './complete';
import { OpenAIEmbedConfig, OpenAIEmbedResponseTransform } from './embed';
import DatabricksAPIConfig from './api';
import {
  OpenAIChatCompleteConfig,
  OpenAIChatCompleteResponseTransform,
} from './chatComplete';

const DatabricksConfig: ProviderConfigs = {
  complete: OpenAICompleteConfig,
  embed: OpenAIEmbedConfig,
  api: DatabricksAPIConfig,
  chatComplete: OpenAIChatCompleteConfig,
  responseTransforms: {
    complete: OpenAICompleteResponseTransform,
    chatComplete: OpenAIChatCompleteResponseTransform,
    embed: OpenAIEmbedResponseTransform,
  },
};

export default DatabricksConfig;
