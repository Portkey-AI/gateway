import { ANTHROPIC } from '../../globals';
import { ProviderConfigs } from '../types';
import AnthropicAPIConfig from './api';
import {
  AnthropicChatCompleteConfig,
  getAnthropicChatCompleteResponseTransform,
  getAnthropicStreamChunkTransform,
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
    chatComplete: getAnthropicChatCompleteResponseTransform(ANTHROPIC),
    'stream-chatComplete': getAnthropicStreamChunkTransform(ANTHROPIC),
    messages: AnthropicMessagesResponseTransform,
  },
};

export default AnthropicConfig;
