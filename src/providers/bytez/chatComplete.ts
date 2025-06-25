import { ProviderConfig } from '../types';

const BytezInferenceChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    // NOTE param acts as an alias, it will be added to "params" on the req body
    // we do this adaptation ourselves in our custom requestHandler. See src/providers/bytez/index.ts
    param: 'max_new_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

export { BytezInferenceChatCompleteConfig };
