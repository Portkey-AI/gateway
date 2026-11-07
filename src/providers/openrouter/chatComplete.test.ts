import {
  OpenrouterChatCompleteResponseTransform,
  OpenrouterChatCompleteStreamChunkTransform,
} from './chatComplete';

const IMAGE_URL = 'data:image/png;base64,aGVsbG8=';

const imageGenerationResponse = {
  id: 'gen-image-1',
  object: 'chat.completion',
  created: 1748372400,
  model: 'openai/gpt-5-image-mini',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: 'Simple black letters HB on a white background.',
        images: [
          {
            type: 'image_url',
            image_url: {
              url: IMAGE_URL,
            },
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 24,
    total_tokens: 36,
  },
};

const transform = (
  response: Record<string, any>,
  strictOpenAiCompliance: boolean
) =>
  OpenrouterChatCompleteResponseTransform(
    response as any,
    200,
    new Headers(),
    strictOpenAiCompliance,
    '',
    { model: 'openai/gpt-5-image-mini', modalities: ['image', 'text'] }
  );

describe('OpenRouter chat image generation', () => {
  it('maps message.images into content_blocks when strict compliance is off', () => {
    const result = transform(imageGenerationResponse, false) as any;
    const message = result.choices[0].message;

    expect(message.content).toBe(
      'Simple black letters HB on a white background.'
    );
    expect(message.images).toEqual([
      {
        type: 'image_url',
        image_url: { url: IMAGE_URL },
      },
    ]);
    expect(message.content_blocks).toEqual([
      {
        type: 'text',
        text: 'Simple black letters HB on a white background.',
      },
      {
        type: 'image_url',
        image_url: { url: IMAGE_URL },
      },
    ]);
  });

  it('keeps the image payload when strict compliance is on', () => {
    const result = transform(imageGenerationResponse, true) as any;
    const message = result.choices[0].message;

    expect(message.content_blocks).toBeUndefined();
    expect(message.images[0].image_url.url).toBe(IMAGE_URL);
  });

  it('maps type-less and url-only image entries', () => {
    const result = transform(
      {
        ...imageGenerationResponse,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: '',
              images: [
                { image_url: { url: IMAGE_URL } },
                { url: 'https://cdn.example/image.png' },
              ],
            },
          },
        ],
      },
      false
    ) as any;

    expect(result.choices[0].message.content_blocks).toEqual([
      { type: 'text', text: '' },
      { type: 'image_url', image_url: { url: IMAGE_URL } },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example/image.png' },
      },
    ]);
  });

  it('maps image parts already present on a content array', () => {
    const result = transform(
      {
        ...imageGenerationResponse,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'generated' },
                {
                  type: 'image_url',
                  image_url: { url: IMAGE_URL },
                },
              ],
            },
          },
        ],
      },
      false
    ) as any;

    expect(result.choices[0].message.content).toEqual([
      { type: 'text', text: 'generated' },
      { type: 'image_url', image_url: { url: IMAGE_URL } },
    ]);
    expect(result.choices[0].message.content_blocks).toEqual([
      { type: 'text', text: 'generated' },
      { type: 'image_url', image_url: { url: IMAGE_URL } },
    ]);
  });

  it('does not duplicate an image that is in both content and images', () => {
    const result = transform(
      {
        ...imageGenerationResponse,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: IMAGE_URL },
                },
              ],
              images: [
                {
                  type: 'image_url',
                  image_url: { url: IMAGE_URL },
                },
              ],
            },
          },
        ],
      },
      false
    ) as any;

    const imageBlocks = result.choices[0].message.content_blocks.filter(
      (block: { type: string }) => block.type === 'image_url'
    );
    expect(imageBlocks).toHaveLength(1);
    expect(imageBlocks[0].image_url.url).toBe(IMAGE_URL);
  });

  it('leaves text-only responses unchanged', () => {
    const result = transform(
      {
        ...imageGenerationResponse,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'just text',
            },
          },
        ],
      },
      false
    ) as any;

    expect(result.choices[0].message).toEqual({
      role: 'assistant',
      content: 'just text',
      content_blocks: [{ type: 'text', text: 'just text' }],
    });
  });

  it('keeps reasoning blocks ahead of generated images', () => {
    const result = transform(
      {
        ...imageGenerationResponse,
        choices: [
          {
            ...imageGenerationResponse.choices[0],
            message: {
              ...imageGenerationResponse.choices[0].message,
              reasoning: 'draw the letters',
            },
          },
        ],
      },
      false
    ) as any;

    expect(
      result.choices[0].message.content_blocks.map(
        (block: { type: string }) => block.type
      )
    ).toEqual(['thinking', 'text', 'image_url']);
    expect(result.choices[0].message.content_blocks[2].image_url.url).toBe(
      IMAGE_URL
    );
  });

  it('maps streamed delta.images into content_blocks and keeps them on the delta', () => {
    const chunk = JSON.stringify({
      id: 'gen-image-1',
      object: 'chat.completion.chunk',
      created: 1748372400,
      model: 'openai/gpt-5-image-mini',
      choices: [
        {
          index: 0,
          finish_reason: null,
          delta: {
            role: 'assistant',
            content: 'caption',
            images: [
              {
                type: 'image_url',
                image_url: { url: IMAGE_URL },
              },
            ],
          },
        },
      ],
    });

    const transformed = OpenrouterChatCompleteStreamChunkTransform(
      `data: ${chunk}`,
      'fallback',
      {},
      false,
      { model: 'openai/gpt-5-image-mini' }
    );
    const parsed = JSON.parse(transformed.replace(/^data: /, '').trim());
    const delta = parsed.choices[0].delta;

    expect(delta.content).toBe('caption');
    expect(delta.images[0].image_url.url).toBe(IMAGE_URL);
    expect(delta.content_blocks).toEqual([
      { index: 0, delta: { text: 'caption' } },
      {
        index: 0,
        delta: {
          type: 'image_url',
          image_url: { url: IMAGE_URL },
        },
      },
    ]);
  });
});
