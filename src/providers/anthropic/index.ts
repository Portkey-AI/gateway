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
import { AnthropicLogConfig } from './pricing';

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
    messages: AnthropicMessagesResponseTransform,
    'stream-chatComplete': getAnthropicStreamChunkTransform(ANTHROPIC),
  },
  pricing: AnthropicLogConfig,
};

export default AnthropicConfig;
