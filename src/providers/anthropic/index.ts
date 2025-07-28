import { ProviderConfigs } from '../types';
import AnthropicAPIConfig from './api';
import {
  AnthropicChatCompleteConfig,
  AnthropicChatCompleteResponseTransform,
  AnthropicChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  AnthropicCompleteConfig,
  AnthropicCompleteResponseTransform,
  AnthropicCompleteStreamChunkTransform,
} from './complete';
import {
  AnthropicMessagesConfig,
  AnthropicMessagesResponseTransform,
} from './messages';

const AnthropicConfig: ProviderConfigs = {
  complete: AnthropicCompleteConfig,
  chatComplete: AnthropicChatCompleteConfig,
  messages: AnthropicMessagesConfig,
  api: AnthropicAPIConfig,
  responseTransforms: {
    'stream-complete': AnthropicCompleteStreamChunkTransform,
    complete: AnthropicCompleteResponseTransform,
    chatComplete: AnthropicChatCompleteResponseTransform,
    'stream-chatComplete': AnthropicChatCompleteStreamChunkTransform,
    messages: AnthropicMessagesResponseTransform,
  },
};

export default AnthropicConfig;
