import MatterAIAPIConfig from './api';
import {
  MatterAIChatCompleteConfig,
  MatterAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { MatterAIEmbedConfig } from './embed';

const MatterAIConfig = {
  api: MatterAIAPIConfig,
  chatComplete: MatterAIChatCompleteConfig,
  embed: MatterAIEmbedConfig,
  streamChunkTransform: MatterAIChatCompleteStreamChunkTransform,
};

export default MatterAIConfig;
