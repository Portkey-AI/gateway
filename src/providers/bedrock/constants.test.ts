import { isAnthropicInvokeModel } from './constants';

describe('isAnthropicInvokeModel', () => {
  it('matches a bare claude model id (region and provider prefix already stripped)', () => {
    expect(isAnthropicInvokeModel('claude-opus-5')).toBe(true);
    expect(isAnthropicInvokeModel('claude-sonnet-4-6')).toBe(true);
  });

  it('matches a model id with the anthropic. provider prefix still present', () => {
    expect(isAnthropicInvokeModel('anthropic.claude-opus-5')).toBe(true);
    expect(isAnthropicInvokeModel('anthropic.claude-sonnet-5-5')).toBe(true);
  });

  it('does not match non-Claude Bedrock models', () => {
    expect(isAnthropicInvokeModel('cohere.command-text-v14')).toBe(false);
    expect(isAnthropicInvokeModel('ai21.j2-ultra-v1')).toBe(false);
    expect(isAnthropicInvokeModel('amazon.titan-text-express-v1')).toBe(false);
    expect(isAnthropicInvokeModel('meta.llama3-70b-instruct-v1:0')).toBe(false);
  });

  it('returns false for undefined or empty input', () => {
    expect(isAnthropicInvokeModel(undefined)).toBe(false);
    expect(isAnthropicInvokeModel('')).toBe(false);
  });
});
