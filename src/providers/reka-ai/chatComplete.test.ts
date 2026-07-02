import { Params } from '../../types/requestBody';
import { ParameterConfig, ProviderConfig } from '../types';
import { RekaAIChatCompleteConfig } from './chatComplete';

const transformMessages = (config: ProviderConfig) => {
  const messagesConfig = config.messages as ParameterConfig;
  return (params: Params) => messagesConfig.transform!(params, {} as any);
};

describe('RekaAIChatCompleteConfig messages transform', () => {
  const transform = transformMessages(RekaAIChatCompleteConfig);

  it('does not throw when the first message is an image', () => {
    expect(() =>
      transform({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'https://x/y.png' } },
            ],
          },
        ],
      } as Params)
    ).not.toThrow();
  });

  it('does not throw when there are no messages', () => {
    expect(() =>
      transform({ messages: [] } as unknown as Params)
    ).not.toThrow();
  });
});
