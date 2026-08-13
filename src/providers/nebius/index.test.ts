import NebiusConfig from './index';

describe('Nebius Token Factory provider config', () => {
  test.each(['chatComplete', 'embed', 'complete'])(
    '%s requires callers to choose a model without a stale default',
    (operation) => {
      expect(NebiusConfig[operation].model).toEqual({
        param: 'model',
        required: true,
      });
    }
  );

  test('labels successful responses with the Nebius provider', () => {
    const response = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'openai/gpt-oss-120b',
      choices: [],
    };

    expect(NebiusConfig.responseTransforms.chatComplete(response, 200)).toEqual(
      { ...response, provider: 'nebius' }
    );
  });

  test('normalizes provider errors with Nebius attribution', () => {
    const response = {
      error: {
        message: 'rate limit exceeded',
        type: 'rate_limit_error',
        param: null,
        code: 'rate_limit_exceeded',
      },
      provider: '',
    };

    expect(NebiusConfig.responseTransforms.chatComplete(response, 429)).toEqual(
      {
        error: {
          message: 'nebius error: rate limit exceeded',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
        provider: 'nebius',
      }
    );
  });
});
