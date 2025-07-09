import { ProviderConfig } from '../types';

const BytezInferenceChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'params.max_new_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'params.temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'params.top_p',
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
