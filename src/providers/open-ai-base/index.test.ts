import { OpenAICreateModelResponseTransformer } from './index';

describe('open-ai-base response transformers', () => {
  it('passes normalized ErrorResponse to customTransformer on non-200 response', () => {
    const mockCustomTransformer = jest.fn((res) => res);
    const transformer = OpenAICreateModelResponseTransformer(
      'openai',
      mockCustomTransformer
    );

    const rawErrorObj = {
      error: {
        message: 'Invalid key',
        type: 'auth_error',
        param: null,
        code: 'invalid_api_key',
      },
    };

    transformer(rawErrorObj, 401);

    expect(mockCustomTransformer).toHaveBeenCalledTimes(1);
    const passedArg = mockCustomTransformer.mock.calls[0][0];
    expect(passedArg.error).toBeDefined();
    expect(passedArg.error.message).toBe('openai error: Invalid key');
  });
});
