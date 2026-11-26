import { chatCompleteParams } from './index';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';

describe('chatCompleteParams', () => {
  it('does not mutate OpenAIChatCompleteConfig when a provider sets a model default', () => {
    const modelParam = OpenAIChatCompleteConfig.model as {
      default?: string;
    };
    const originalDefault = modelParam.default;

    const zai = chatCompleteParams([], { model: 'glm-4.6' });
    const groq = chatCompleteParams([], {
      model: 'llama-3.3-70b-versatile',
    });

    expect(modelParam.default).toBe(originalDefault);
    expect((zai.model as { default?: string }).default).toBe('glm-4.6');
    expect((groq.model as { default?: string }).default).toBe(
      'llama-3.3-70b-versatile'
    );
  });

  it('keeps per-provider defaults independent across calls', () => {
    const first = chatCompleteParams([], { model: 'model-a' });
    const second = chatCompleteParams([], { model: 'model-b' });

    expect((first.model as { default?: string }).default).toBe('model-a');
    expect((second.model as { default?: string }).default).toBe('model-b');
    expect(
      (OpenAIChatCompleteConfig.model as { default?: string }).default
    ).toBe('gpt-5.6-terra');
  });
});
