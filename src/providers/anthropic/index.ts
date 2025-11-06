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
  messagesCountTokens: AnthropicMessagesConfig,
  api: AnthropicAPIConfig,
  responseTransforms: {
    'stream-complete': AnthropicCompleteStreamChunkTransform,
    complete: AnthropicCompleteResponseTransform,
    chatComplete: AnthropicChatCompleteResponseTransform,
    messages: AnthropicMessagesResponseTransform,
    'stream-chatComplete': AnthropicChatCompleteStreamChunkTransform,
  },
};

export default AnthropicConfig;
