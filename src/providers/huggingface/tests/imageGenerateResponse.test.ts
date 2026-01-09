import { HuggingFaceImageGenerateResponseTransform } from '../imageGenerateResponse';

describe('HuggingFace image response transform', () => {
  test('converts binary image to OpenAI-compatible response', () => {
    const fakeImageBuffer = Buffer.from('fake-image-binary');

    const result = HuggingFaceImageGenerateResponseTransform(
      fakeImageBuffer,
      200,
      {
        'content-type': 'image/png',
      }
    );

    // Type narrowing
    if ('data' in result) {
      expect(result.data[0]).toHaveProperty('b64_json');
      expect(result.provider).toBe('huggingface');
    } else {
      throw new Error('Expected image response, got error');
    }
  });

  test('handles HF JSON error response', () => {
    const result = HuggingFaceImageGenerateResponseTransform(
      { error: 'Model loading failed' },
      500,
      { 'content-type': 'application/json' }
    );

    // Type narrowing
    if ('error' in result) {
      expect(result.error.message).toMatch(/model loading failed/i);
    } else {
      throw new Error('Expected error response');
    }
  });
});
