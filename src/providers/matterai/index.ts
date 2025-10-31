import MatterAIAPIConfig from './api';
import {
  MatterAIChatCompleteConfig,
  MatterAIChatCompleteStreamChunkTransform,
} from './chatComplete';

const MatterAIConfig = {
  api: MatterAIAPIConfig,
  chatComplete: MatterAIChatCompleteConfig,
  streamChunkTransform: MatterAIChatCompleteStreamChunkTransform,
};

export default MatterAIConfig;
