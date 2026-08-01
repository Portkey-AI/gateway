import { AnthropicChatCompleteConfig } from './chatComplete';

const getSystemTransform = () => {
  const messagesConfig = AnthropicChatCompleteConfig.messages as any[];
  const systemConfig = messagesConfig.find((c) => c.param === 'system');
  if (!systemConfig?.transform) {
    throw new Error('system transform not found');
  }
  return systemConfig.transform as (params: any) => any;
};

describe('AnthropicChatCompleteConfig system message transform', () => {
  it('does not throw on an empty system content array', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [{ role: 'system', content: [] }],
    } as any);
    expect(result).toEqual([]);
  });

  it('still transforms array-form system content', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'be concise' }] },
      ],
    } as any);
    expect(result).toEqual([{ text: 'be concise', type: 'text' }]);
  });

  it('keeps text that follows a non-text block', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [
        {
          role: 'system',
          content: [
            { type: 'image', source: { type: 'base64', data: 'x' } },
            { type: 'text', text: 'be concise' },
          ],
        },
      ],
    } as any);
    expect(result).toEqual([{ text: 'be concise', type: 'text' }]);
  });

  it('keeps text that follows an empty text block', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'be concise' },
          ],
        },
      ],
    } as any);
    expect(result).toEqual([{ text: 'be concise', type: 'text' }]);
  });

  it('does not emit a text block for a trailing non-text block', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'be concise' },
            { type: 'image', source: { type: 'base64', data: 'x' } },
          ],
        },
      ],
    } as any);
    expect(result).toEqual([{ text: 'be concise', type: 'text' }]);
  });

  it('preserves cache_control on text blocks', () => {
    const transform = getSystemTransform();
    const result = transform({
      messages: [
        {
          role: 'system',
          content: [
            { type: 'image', source: { type: 'base64', data: 'x' } },
            {
              type: 'text',
              text: 'be concise',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
    } as any);
    expect(result).toEqual([
      {
        text: 'be concise',
        type: 'text',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });
});
