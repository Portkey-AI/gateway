import { handler as moderateContentHandler } from './moderateContent';
import { handler as piiHandler } from './pii';
import { handler as languageHandler } from './language';
import { handler as gibberishHandler } from './gibberish';
import testCreds from './.creds.json';
import {
  mockPluginHandlerOptions,
  createChatCompleteRequestContext,
  createChatCompleteResponseContext,
} from '../testUtils';

describe('moderateContentHandler', () => {
  it('should detect violent content', async () => {
    const context = createChatCompleteRequestContext(
      'I really want to murder him brutally.'
    );
    const parameters = {
      credentials: testCreds,
      categories: ['violence'],
      not: false,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      not: false,
      explanation: expect.stringContaining(
        'Found restricted content categories: violence'
      ),
      flaggedCategories: ['violence'],
      restrictedCategories: ['violence'],
    });
  });

  it('should pass clean content', async () => {
    const context = createChatCompleteRequestContext(
      'This is a perfectly clean text about flowers and sunshine.'
    );
    const parameters = {
      credentials: testCreds,
      categories: ['violence', 'hate'],
      not: false,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: 'No restricted content categories were found.',
      flaggedCategories: [],
      restrictedCategories: ['violence', 'hate'],
    });
  });

  it('should handle inverted results with not=true', async () => {
    const context = createChatCompleteRequestContext(
      'I really want to murder him brutally.'
    );
    const parameters = {
      credentials: testCreds,
      categories: ['violence'],
      not: true,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: 'Found restricted content categories as expected.',
    });
  });
});

describe('piiHandler', () => {
  const piiTestText =
    'My credit card number is 0123 0123 0123 0123, and my email is abc@xyz.com';

  it('should only detect PII in text', async () => {
    const context = createChatCompleteRequestContext(piiTestText);
    const parameters = {
      categories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
      credentials: testCreds,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      not: false,
      explanation: expect.stringContaining('Found restricted PII'),
      restrictedCategories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
    });
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should detect and redact PII in request text', async () => {
    const context = createChatCompleteRequestContext(piiTestText);
    const parameters = {
      categories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
      credentials: testCreds,
      redact: true,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: expect.stringContaining('redacted'),
      restrictedCategories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
    });
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'My credit card number is [CREDIT_CARD_1], and my email is [EMAIL_ADDRESS_1]'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in request text with multiple content parts', async () => {
    // Manual context for multipart content (not supported by helper)
    const context = {
      request: {
        text: piiTestText,
        json: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'My credit card number is 0123 0123 0123 0123,',
                },
                {
                  type: 'text',
                  text: 'and my email is abc@xyz.com',
                },
              ],
            },
          ],
        },
      },
      requestType: 'chatComplete' as const,
    };
    const parameters = {
      categories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
      credentials: testCreds,
      redact: true,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: expect.stringContaining('redacted'),
      restrictedCategories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
    });
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).toBe('My credit card number is [CREDIT_CARD_1],');
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[1]?.text
    ).toBe('and my email is [EMAIL_ADDRESS_1]');
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in response text', async () => {
    const context = createChatCompleteResponseContext(piiTestText);
    const parameters = {
      categories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
      credentials: testCreds,
      redact: true,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'afterRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: expect.stringContaining('redacted'),
      restrictedCategories: ['CREDIT_CARD', 'EMAIL_ADDRESS'],
    });
    expect(
      result.transformedData?.response?.json?.choices?.[0]?.message?.content
    ).toBe(
      'My credit card number is [CREDIT_CARD_1], and my email is [EMAIL_ADDRESS_1]'
    );
    expect(result.transformed).toBe(true);
  });

  it('should pass text without PII', async () => {
    const context = createChatCompleteRequestContext(
      'This is a text without any personal information.'
    );
    const parameters = {
      categories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
      credentials: testCreds,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: 'No restricted PII was found in the text.',
    });
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should handle inverted results with not=true', async () => {
    const context = createChatCompleteRequestContext(piiTestText);
    const parameters = {
      categories: ['CREDIT_CARD'],
      credentials: testCreds,
      not: true,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: 'PII was found in the text as expected.',
    });
    expect(result.transformed).toBe(false);
  });

  it('should handle and redact inverted results with not=true', async () => {
    const context = createChatCompleteRequestContext(piiTestText);
    const parameters = {
      categories: ['CREDIT_CARD'],
      credentials: testCreds,
      not: true,
      redact: true,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: expect.stringContaining('redacted'),
    });
    expect(result.transformed).toBe(true);
  });
});

describe('languageHandler', () => {
  it('should detect correct language', async () => {
    const context = createChatCompleteRequestContext('Por favor hola gracias');
    const parameters = {
      language: ['spa_Latn'],
      credentials: testCreds,
      not: false,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: expect.stringContaining(
        'is in one of the specified languages'
      ),
      detectedLanguage: 'spa_Latn',
      allowedLanguages: ['spa_Latn'],
    });
  });

  it('should detect incorrect language', async () => {
    const context = createChatCompleteRequestContext('hola mundo');
    const parameters = {
      language: ['eng_Latn'],
      credentials: testCreds,
      not: false,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      not: false,
      explanation: expect.stringContaining(
        'is not in any of the specified languages'
      ),
    });
  });

  it('should handle inverted results with not=true', async () => {
    const context = createChatCompleteRequestContext('hola mundo');
    const parameters = {
      language: ['eng_Latn'],
      credentials: testCreds,
      not: true,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: expect.stringContaining(
        'is not in any of the specified languages'
      ),
    });
  });
});

describe('gibberishHandler', () => {
  it('should detect clean text', async () => {
    const context = createChatCompleteRequestContext(
      'This is a perfectly normal English sentence.'
    );
    const parameters = {
      credentials: testCreds,
      not: false,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: 'The text is not gibberish.',
    });
  });

  it('should detect gibberish text', async () => {
    const context = createChatCompleteRequestContext(
      'asdf jkl; qwer uiop zxcv bnm,'
    );
    const parameters = {
      credentials: testCreds,
      not: false,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      not: false,
      explanation: 'The text appears to be gibberish.',
    });
  });

  it('should handle inverted results with not=true', async () => {
    const context = createChatCompleteRequestContext(
      'asdf jkl; qwer uiop zxcv bnm,'
    );
    const parameters = {
      credentials: testCreds,
      not: true,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: 'The text is gibberish as expected.',
    });
  });
});
