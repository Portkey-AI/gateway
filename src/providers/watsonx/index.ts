import { ProviderConfigs } from '../types';
import WXApiConfig from './api';
// import {
//   AnthropicChatCompleteConfig,
//   AnthropicChatCompleteResponseTransform,
//   AnthropicChatCompleteStreamChunkTransform,
// } from './chatComplete';
// import {
//   AnthropicCompleteConfig,
//   AnthropicCompleteResponseTransform,
//   AnthropicCompleteStreamChunkTransform,
// } from './complete';

const WatsonxConfig: ProviderConfigs = {
//   complete: AnthropicCompleteConfig,
//   chatComplete: AnthropicChatCompleteConfig,
  api: WXApiConfig,
  responseTransforms: {
    // 'stream-complete': AnthropicCompleteStreamChunkTransform,
    // complete: AnthropicCompleteResponseTransform,
    // chatComplete: AnthropicChatCompleteResponseTransform,
    // 'stream-chatComplete': AnthropicChatCompleteStreamChunkTransform,
  },
};

export default WatsonxConfig;
