import { cerebrasProviderAPIConfig } from '.';

describe('Cerebras chat completion parameters', () => {
  it.each([
    'frequency_penalty',
    'logit_bias',
    'logprobs',
    'presence_penalty',
    'parallel_tool_calls',
    'service_tier',
  ])('forwards %s', (parameter) => {
    expect(cerebrasProviderAPIConfig.chatComplete).toHaveProperty(parameter);
  });
});
