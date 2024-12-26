import { handler as moderateContentHandler } from './moderateContent';
import { handler as piiHandler } from './pii';
import { handler as languageHandler } from './language';
import { handler as gibberishHandler } from './gibberish';
import testCreds from './.creds.json';

describe('moderateContentHandler', () => {
  const mockOptions = { env: {} };

  it('should detect violent content', async () => {
    const context = {
      request: { text: 'I really want to murder him brutally.' },
    };
    const parameters = {
      credentials: testCreds,
      categories: ['violence'],
      not: false,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: {
        text: 'This is a perfectly clean text about flowers and sunshine.',
      },
    };
    const parameters = {
      credentials: testCreds,
      categories: ['violence', 'hate'],
      not: false,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: { text: 'I really want to murder him brutally.' },
    };
    const parameters = {
      credentials: testCreds,
      categories: ['violence'],
      not: true,
    };

    const result = await moderateContentHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
  const mockOptions = { env: {} };

  it('should detect PII in text', async () => {
    const context = {
      request: {
        text: 'My credit card number is 0123 0123 0123 0123, and I live in Wilmington, Delaware',
      },
    };
    const parameters = {
      categories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
      credentials: testCreds,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      not: false,
      explanation: expect.stringContaining('Found restricted PII'),
      restrictedCategories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
    });
  });

  it('should pass text without PII', async () => {
    const context = {
      request: { text: 'This is a text without any personal information.' },
    };
    const parameters = {
      categories: ['CREDIT_CARD', 'LOCATION_ADDRESS'],
      credentials: testCreds,
      not: false,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: false,
      explanation: 'No restricted PII was found in the text.',
    });
  });

  it('should handle inverted results with not=true', async () => {
    const context = {
      request: {
        text: 'My credit card number is 0123 0123 0123 0123',
      },
    };
    const parameters = {
      categories: ['CREDIT_CARD'],
      credentials: testCreds,
      not: true,
    };

    const result = await piiHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      not: true,
      explanation: 'PII was found in the text as expected.',
    });
  });
});

describe('languageHandler', () => {
  const mockOptions = { env: {} };

  it('should detect correct language', async () => {
    const context = {
      request: { text: 'hola mundo' },
    };
    const parameters = {
      language: ['spa_Latn'],
      credentials: testCreds,
      not: false,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: { text: 'hola mundo' },
    };
    const parameters = {
      language: ['eng_Latn'],
      credentials: testCreds,
      not: false,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: { text: 'hola mundo' },
    };
    const parameters = {
      language: ['eng_Latn'],
      credentials: testCreds,
      not: true,
    };

    const result = await languageHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
  const mockOptions = { env: {} };

  it('should detect clean text', async () => {
    const context = {
      request: { text: 'This is a perfectly normal English sentence.' },
    };
    const parameters = {
      credentials: testCreds,
      not: false,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: { text: 'asdf jkl; qwer uiop zxcv bnm,' },
    };
    const parameters = {
      credentials: testCreds,
      not: false,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
    const context = {
      request: { text: 'asdf jkl; qwer uiop zxcv bnm,' },
    };
    const parameters = {
      credentials: testCreds,
      not: true,
    };

    const result = await gibberishHandler(
      context,
      parameters,
      'beforeRequestHook',
      mockOptions
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
