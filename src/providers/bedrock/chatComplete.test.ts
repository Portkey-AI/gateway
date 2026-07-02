// `../../utils/env` uses a top-level await that ts-jest (CommonJS) cannot
// transpile. It is unrelated to these pure prompt transforms, so stub it out.
jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (value?: string) => value,
}));

import { Params } from '../../types/requestBody';
import { ParameterConfig, ProviderConfig } from '../types';
import {
  BedrockAI21ChatCompleteConfig,
  BedrockCohereChatCompleteConfig,
} from './chatComplete';

const transformMessages = (config: ProviderConfig) => {
  const messagesConfig = config.messages as ParameterConfig;
  return (params: Params): string =>
    messagesConfig.transform!(params, {} as any);
};

const configs = {
  'Bedrock Cohere': BedrockCohereChatCompleteConfig,
  'Bedrock AI21': BedrockAI21ChatCompleteConfig,
};

describe.each(Object.entries(configs))(
  '%s chatComplete messages transform',
  (_name, config) => {
    const transform = transformMessages(config);

    it('renders the system message content instead of the raw messages array', () => {
      const prompt = transform({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello there' },
        ],
      } as Params);

      // Regression guard: `${messages}` used to interpolate the whole array.
      expect(prompt).not.toContain('[object Object]');
      expect(prompt).toContain('system: You are a helpful assistant.');
      expect(prompt).toContain('user: Hello there');
    });

    it('still renders user and assistant turns', () => {
      const prompt = transform({
        messages: [
          { role: 'user', content: 'What is 2 + 2?' },
          { role: 'assistant', content: '4' },
        ],
      } as Params);

      expect(prompt).not.toContain('[object Object]');
      expect(prompt).toContain('user: What is 2 + 2?');
      expect(prompt).toContain('assistant: 4');
    });
  }
);
