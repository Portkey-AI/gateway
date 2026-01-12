import { isHFImageModel } from '../utils';

describe('HuggingFace image model detection', () => {
  test('detects FLUX models as image models', () => {
    expect(isHFImageModel('black-forest-labs/FLUX.1-dev')).toBe(true);
  });

  test('does not misclassify text models', () => {
    expect(isHFImageModel('meta-llama/Llama-3.1-8B-Instruct')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isHFImageModel('')).toBe(false);
  });
});
