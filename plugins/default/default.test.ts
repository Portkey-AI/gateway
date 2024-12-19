import { handler as regexMatchHandler } from './regexMatch';
import { handler as jsonSchemaHandler } from './jsonSchema';
import { handler as jsonKeysHandler } from './jsonKeys';
import { handler as containsHandler } from './contains';
import { handler as validUrlsHandler } from './validUrls';
import { handler as containsCodeHandler } from './containsCode';
import { handler as wordCountHandler } from './wordCount';
import { handler as sentenceCountHandler } from './sentenceCount';
import { handler as webhookHandler } from './webhook';
import { handler as logHandler } from './log';
import { handler as allUppercaseHandler } from './alluppercase';
import { handler as endsWithHandler } from './endsWith';
import { handler as allLowerCaseHandler } from './alllowercase';
import { handler as modelWhitelistHandler } from './modelWhitelist';
import { handler as characterCountHandler } from './characterCount';

import { z } from 'zod';
import { PluginContext, PluginParameters } from '../types';

describe('Regex Matcher Plugin', () => {
  const mockContext: PluginContext = {
    response: {
      text: 'The quick brown fox jumps over the lazy dog.',
    },
  };

  const mockEventType = 'afterRequestHook';

  it('should match a simple regex pattern', async () => {
    const parameters: PluginParameters = { rule: 'quick.*fox', not: false };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.verdict).toBe(true);
    expect(result.data.explanation).toContain('successfully matched');
    expect(result.data.matchDetails.matchedText).toBe('quick brown fox');
  });

  it('should not match when pattern is not found', async () => {
    const parameters: PluginParameters = { rule: 'zebra', not: false };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.verdict).toBe(false);
    expect(result.data.explanation).toContain('did not match');
    expect(result.data.matchDetails).toBeNull();
  });

  it('should handle regex with capturing groups', async () => {
    const parameters: PluginParameters = {
      rule: '(quick) (brown) (fox)',
      not: false,
    };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.verdict).toBe(true);
    expect(result.data.matchDetails.captures).toEqual([
      'quick',
      'brown',
      'fox',
    ]);
    expect(result.data.matchDetails.groups).toEqual({});
  });

  it('should handle regex with named capturing groups', async () => {
    const parameters: PluginParameters = {
      rule: '(?<adjective1>quick) (?<adjective2>brown) (?<animal>fox)',
      not: false,
    };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.verdict).toBe(true);
    expect(result.data.matchDetails.groups).toEqual({
      adjective1: 'quick',
      adjective2: 'brown',
      animal: 'fox',
    });
  });

  it('should provide text excerpt in data', async () => {
    const parameters: PluginParameters = { rule: 'dog', not: false };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.data.textExcerpt).toBe(
      'The quick brown fox jumps over the lazy dog.'
    );
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'a'.repeat(200);
    const longTextContext: PluginContext = { response: { text: longText } };
    const parameters: PluginParameters = { rule: 'a', not: false };
    const result = await regexMatchHandler(
      longTextContext,
      parameters,
      mockEventType
    );

    expect(result.data.textExcerpt).toBe('a'.repeat(100) + '...');
  });

  it('should throw error for invalid regex', async () => {
    const parameters: PluginParameters = { rule: '(', not: false }; // Invalid regex
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBeNull();
    expect(result.data.explanation).toContain('An error occurred');
  });

  it('should handle missing regex pattern', async () => {
    const parameters: PluginParameters = { rule: '', not: false };
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBeNull();
    expect(result.data.explanation).toContain('Missing regex pattern');
  });

  it('should handle missing text to match', async () => {
    const emptyContext: PluginContext = { response: { text: '' } };
    const parameters: PluginParameters = { rule: 'test', not: false };
    const result = await regexMatchHandler(
      emptyContext,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBeNull();
    expect(result.data.explanation).toContain('Missing text to match');
  });
});

describe('jsonSchema handler', () => {
  it('should validate JSON in response text', async () => {
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
        required: ['key'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key: 'value' });
    expect(result.data.explanation).toContain('Successfully validated');
  });

  it('should return a false verdict when schema does not match', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key": "value"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: { key2: { type: 'string' } },
        required: ['key2'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    console.log(JSON.stringify(result, null, 2));

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });

  it('should validate JSON in response text - complex', async () => {
    const context: PluginContext = {
      response: {
        text: '```json\n{\n  "title": "The Rise of AI Agents: Transforming the Future",\n  "short_intro": "Artificial Intelligence (AI) agents are revolutionizing various sectors, from healthcare to finance. In this blog, we explore the development of AI agents, their applications, and their potential to reshape our world."\n}\n```',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          short_intro: { type: 'string' },
        },
        required: ['title', 'short_intro'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toHaveProperty('title');
    expect(result.data.matchedJson).toHaveProperty('short_intro');
    expect(result.data.explanation).toContain('Successfully validated');
  });

  it('should validate only JSON in response text', async () => {
    const context: PluginContext = {
      response: {
        text: '{\n  "title": "The Rise of AI Agents: Transforming the Future",\n  "short_intro": "Artificial Intelligence (AI) agents are revolutionizing various sectors, from healthcare to finance. In this blog, we explore the development of AI agents, their applications, and their potential to reshape our world."\n}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          short_intro: { type: 'string' },
        },
        required: ['title', 'short_intro'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toHaveProperty('title');
    expect(result.data.matchedJson).toHaveProperty('short_intro');
    expect(result.data.explanation).toContain('Successfully validated');
  });

  it('should return a false verdict for invalid JSON in response text', async () => {
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value`,
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
        required: ['key'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('Failed to validate');
    expect(result.data.validationErrors).toBeDefined();
    expect(Array.isArray(result.data.validationErrors)).toBe(true);
  });

  it('should return explanation when no valid JSON is found', async () => {
    const context: PluginContext = {
      response: {
        text: 'This is just plain text with no JSON',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
        required: ['key'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('No valid JSON found');
  });

  it('should validate nested JSON structures', async () => {
    const context: PluginContext = {
      response: {
        text: `Here's a complex user profile:
\`\`\`json
{
  "user": {
    "name": "John Doe",
    "contact": {
      "email": "john@example.com",
      "phone": {
        "country": "+1",
        "number": "555-0123"
      }
    },
    "preferences": {
      "theme": "dark",
      "notifications": true
    }
  }
}
\`\`\`
And that's all the user information we have.`,
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            required: ['name', 'contact', 'preferences'],
            properties: {
              name: { type: 'string' },
              contact: {
                type: 'object',
                required: ['email', 'phone'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  phone: {
                    type: 'object',
                    required: ['country', 'number'],
                    properties: {
                      country: { type: 'string' },
                      number: { type: 'string' },
                    },
                  },
                },
              },
              preferences: {
                type: 'object',
                required: ['theme', 'notifications'],
                properties: {
                  theme: { type: 'string', enum: ['light', 'dark'] },
                  notifications: { type: 'boolean' },
                },
              },
            },
          },
        },
        required: ['user'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({
      user: {
        name: 'John Doe',
        contact: {
          email: 'john@example.com',
          phone: {
            country: '+1',
            number: '555-0123',
          },
        },
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      },
    });
    expect(result.data.explanation).toContain('Successfully validated');
  });

  it('should fail validation for invalid nested JSON', async () => {
    const context: PluginContext = {
      response: {
        text: `Let me show you the user profile with some invalid data:
\`\`\`json
{
  "user": {
    "name": "John Doe",
    "contact": {
      "email": "invalid-email",
      "phone": {
        "country": "+1"
      }
    },
    "preferences": {
      "theme": "invalid-theme",
      "notifications": "not-a-boolean"
    }
  }
}
\`\`\`
As you can see, there are several validation issues in this profile.`,
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            required: ['name', 'contact', 'preferences'],
            properties: {
              name: { type: 'string' },
              contact: {
                type: 'object',
                required: ['email', 'phone'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  phone: {
                    type: 'object',
                    required: ['country', 'number'],
                    properties: {
                      country: { type: 'string' },
                      number: { type: 'string' },
                    },
                  },
                },
              },
              preferences: {
                type: 'object',
                required: ['theme', 'notifications'],
                properties: {
                  theme: { type: 'string', enum: ['light', 'dark'] },
                  notifications: { type: 'boolean' },
                },
              },
            },
          },
        },
        required: ['user'],
      },
      not: false,
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('Failed to validate');
    expect(result.data.validationErrors).toBeDefined();
    expect(Array.isArray(result.data.validationErrors)).toBe(true);

    // Verify specific validation errors
    const errors = result.data.validationErrors;
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('format "email"'),
          path: expect.any(String),
        }),
        expect.objectContaining({
          message: expect.stringContaining('required property "number"'),
          path: expect.any(String),
        }),
        expect.objectContaining({
          message: expect.stringContaining('match any of ["light","dark"]'),
          path: expect.any(String),
        }),
        expect.objectContaining({
          message: expect.stringContaining('notifications'),
          path: expect.any(String),
        }),
      ])
    );
  });
});

describe('jsonKeys handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should validate JSON with "any" operator and find match', async () => {
    const context: PluginContext = {
      response: { text: '{"key1": "value1", "key2": "value2"}' },
    };
    const parameters: PluginParameters = {
      keys: ['key1', 'key3'],
      operator: 'any',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      matchedJson: { key1: 'value1', key2: 'value2' },
      verdict: true,
      explanation:
        'Successfully found at least one required key. Found keys: [key1].',
      presentKeys: ['key1'],
      missingKeys: ['key3'],
      operator: 'any',
      textExcerpt: '{"key1": "value1", "key2": "value2"}',
    });
  });

  it('should validate JSON with "all" operator and find all keys', async () => {
    const context: PluginContext = {
      response: { text: '{"key1": "value1", "key2": "value2"}' },
    };
    const parameters: PluginParameters = {
      keys: ['key1', 'key2'],
      operator: 'all',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      matchedJson: { key1: 'value1', key2: 'value2' },
      verdict: true,
      explanation:
        'Successfully found all required keys. Found keys: [key1, key2].',
      presentKeys: ['key1', 'key2'],
      missingKeys: [],
      operator: 'all',
      textExcerpt: '{"key1": "value1", "key2": "value2"}',
    });
  });

  it('should validate JSON with "none" operator and find no matches', async () => {
    const context: PluginContext = {
      response: { text: '{"key1": "value1", "key2": "value2"}' },
    };
    const parameters: PluginParameters = {
      keys: ['key3', 'key4'],
      operator: 'none',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      matchedJson: { key1: 'value1', key2: 'value2' },
      verdict: true,
      explanation:
        'Successfully verified no required keys are present. Missing keys: [key3, key4].',
      presentKeys: [],
      missingKeys: ['key3', 'key4'],
      operator: 'none',
      textExcerpt: '{"key1": "value1", "key2": "value2"}',
    });
  });

  it('should handle JSON in code blocks', async () => {
    const context: PluginContext = {
      response: { text: '```json\n{"key1": "value1", "key2": "value2"}\n```' },
    };
    const parameters: PluginParameters = {
      keys: ['key1'],
      operator: 'any',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.matchedJson).toEqual({ key1: 'value1', key2: 'value2' });
    expect(result.data.presentKeys).toEqual(['key1']);
  });

  it('should handle multiple JSON objects and find best match', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1"} {"key2": "value2", "key3": "value3"}',
      },
    };
    const parameters: PluginParameters = {
      keys: ['key2', 'key3'],
      operator: 'all',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.matchedJson).toEqual({ key2: 'value2', key3: 'value3' });
    expect(result.data.presentKeys).toEqual(['key2', 'key3']);
  });

  it('should handle missing text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      keys: ['key1'],
      operator: 'any',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while processing JSON: Missing text to analyze',
      operator: 'any',
      requiredKeys: ['key1'],
      textExcerpt: 'No text available',
    });
  });

  it('should handle missing keys array', async () => {
    const context: PluginContext = {
      response: { text: '{"key1": "value1"}' },
    };
    const parameters: PluginParameters = {
      operator: 'any',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Missing or invalid keys array');
    expect(result.verdict).toBe(false);
  });

  it('should handle invalid operator', async () => {
    const context: PluginContext = {
      response: { text: '{"key1": "value1"}' },
    };
    const parameters: PluginParameters = {
      keys: ['key1'],
      operator: 'invalid' as any,
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe(
      'Invalid or missing operator (must be "any", "all", or "none")'
    );
    expect(result.verdict).toBe(false);
  });

  it('should handle no valid JSON in text', async () => {
    const context: PluginContext = {
      response: { text: 'This is just plain text with no JSON' },
    };
    const parameters: PluginParameters = {
      keys: ['key1'],
      operator: 'any',
      not: false,
    };

    const result = await jsonKeysHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: 'No valid JSON found in the text.',
      requiredKeys: ['key1'],
      operator: 'any',
      textExcerpt: 'This is just plain text with no JSON',
    });
  });
});

describe('contains handler', () => {
  it('should return true verdict and correct data for any word in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this word1 and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      words: ['word1', 'word2'],
      operator: 'any',
      not: false,
    };

    const result = await containsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation: "Check passed for 'any' words. At least one word was found.",
      foundWords: ['word1'],
      missingWords: ['word2'],
      operator: 'any',
    });
  });

  it('should return false verdict and correct data for all words in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this word1 and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      words: ['word1', 'word2'],
      operator: 'all',
      not: false,
    };

    const result = await containsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: "Check failed for 'all' words. Some words were missing.",
      foundWords: ['word1'],
      missingWords: ['word2'],
      operator: 'all',
    });
  });

  it('should return true verdict and correct data for none of the words in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this word1 and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      words: ['word2', 'word3'],
      operator: 'none',
      not: false,
    };

    const result = await containsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation: "Check passed for 'none' words. No words were found.",
      foundWords: [],
      missingWords: ['word2', 'word3'],
      operator: 'none',
    });
  });

  it('should handle empty word list', async () => {
    const context: PluginContext = {
      response: {
        text: 'some text',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      words: [],
      operator: 'any',
      not: false,
    };

    const result = await containsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: "Check failed for 'any' words. No words were found.",
      foundWords: [],
      missingWords: [],
      operator: 'any',
    });
  });

  it('should handle case sensitivity', async () => {
    const context: PluginContext = {
      response: {
        text: 'Adding some TEXT before this Word1 and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      words: ['text', 'word1'],
      operator: 'all',
      not: false,
    };

    const result = await containsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: "Check failed for 'all' words. Some words were missing.",
      foundWords: ['text'],
      missingWords: ['word1'],
      operator: 'all',
    });
  });
});

describe('validUrls handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict for valid URLs in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'Check out https://example.com and https://google.com',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      validationMethod: 'DNS lookup',
      validUrls: expect.arrayContaining([
        'https://example.com',
        'https://google.com',
      ]),
      invalidUrls: [],
    });
  });

  it('should return false verdict for invalid URLs', async () => {
    const context: PluginContext = {
      response: {
        text: 'Check out https://invalid-domain-123456.com',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      validationMethod: 'DNS lookup',
      validUrls: [],
      invalidUrls: ['https://invalid-domain-123456.com'],
    });
  });

  it('should handle text with no URLs', async () => {
    const context: PluginContext = {
      response: {
        text: 'This text contains no URLs',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: false,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      explanation: 'No URLs found in the text.',
      urls: [],
      validationMethod: 'HTTP request',
    });
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      onlyDNS: false,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      explanation:
        'An error occurred while validating URLs: Missing text to analyze',
      validationMethod: 'HTTP request',
      textExcerpt: 'No text available',
    });
  });

  it('should handle malformed URLs', async () => {
    const context: PluginContext = {
      response: {
        text: 'Check out https://malformed.123 and http://this-is-definitely-invalid-12345.com/path?invalid=true#bad',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      validationMethod: 'DNS lookup',
      validUrls: [],
      invalidUrls: expect.arrayContaining([
        'https://malformed.123',
        'http://this-is-definitely-invalid-12345.com/path?invalid=true#bad',
      ]),
      explanation: 'Some URLs are invalid (2 of 2 failed).',
    });
  });

  it('should handle URLs with query parameters and fragments', async () => {
    const context: PluginContext = {
      response: {
        text: 'Check out https://example.com/path?param=1#section',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.data).toMatchObject({
      validationMethod: 'DNS lookup',
      validUrls: ['https://example.com/path?param=1#section'],
    });
  });

  it('should handle multiple URLs with mixed validity', async () => {
    const context: PluginContext = {
      response: {
        text: 'Valid: https://example.com Invalid: https://invalid-domain-123456.com',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      validationMethod: 'DNS lookup',
      validUrls: ['https://example.com'],
      invalidUrls: ['https://invalid-domain-123456.com'],
      explanation: 'Some URLs are invalid (1 of 2 failed).',
    });
  });

  it('should handle HTTP validation mode', async () => {
    const context: PluginContext = {
      response: {
        text: 'Check out https://example.com',
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: false,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.data).toMatchObject({
      validationMethod: 'HTTP request',
      textExcerpt: 'Check out https://example.com',
    });
  });

  it('should handle very long text with URLs', async () => {
    const longText = `Here's a very long text ${'-'.repeat(200)} with a URL https://example.com in the middle ${'-'.repeat(200)}`;
    const context: PluginContext = {
      response: {
        text: longText,
      },
    };
    const parameters: PluginParameters = {
      onlyDNS: true,
      not: false,
    };

    const result = await validUrlsHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103); // 100 chars + '...'
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
    expect(result.data.validUrls).toContain('https://example.com');
  });
});

describe('sentenceCount handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict for sentence count within range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence. This is another sentence.' },
    };
    const parameters: PluginParameters = {
      minSentences: 1,
      maxSentences: 3,
      not: false,
    };

    const result = await sentenceCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      sentenceCount: 2,
      minCount: 1,
      maxCount: 3,
      not: false,
      verdict: true,
      explanation:
        'The sentence count (2) is within the specified range of 1 to 3.',
      textExcerpt: 'This is a sentence. This is another sentence.',
    });
  });

  it('should return false verdict for sentence count outside range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence. This is another sentence.' },
    };
    const parameters: PluginParameters = {
      minSentences: 3,
      maxSentences: 4,
      not: false,
    };

    const result = await sentenceCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      sentenceCount: 2,
      minCount: 3,
      maxCount: 4,
      not: false,
      verdict: false,
      explanation:
        'The sentence count (2) is outside the specified range of 3 to 4.',
      textExcerpt: 'This is a sentence. This is another sentence.',
    });
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'This is a sentence. '.repeat(20);
    const context: PluginContext = {
      response: { text: longText },
    };
    const parameters: PluginParameters = {
      minSentences: 1,
      maxSentences: 30,
      not: false,
    };

    const result = await sentenceCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103); // 100 characters + '...'
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
  });

  it('should return error for missing sentence count range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence.' },
    };
    const parameters: PluginParameters = {};

    const result = await sentenceCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Missing sentence count range');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: 'An error occurred: Missing sentence count range',
      minCount: undefined,
      maxCount: undefined,
      not: false,
      textExcerpt: 'This is a sentence.',
    });
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      minSentences: 1,
      maxSentences: 3,
      not: false,
    };

    const result = await sentenceCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      sentenceCount: 0,
      minCount: 1,
      maxCount: 3,
      not: false,
      verdict: false,
      explanation:
        'The sentence count (0) is outside the specified range of 1 to 3.',
      textExcerpt: '',
    });
  });
});

describe('containsCode handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should detect code blocks with matching format', async () => {
    const context: PluginContext = {
      response: { text: '```py\nprint("Hello World")\n```' },
    };
    const parameters: PluginParameters = {
      format: 'Python',
      not: false,
    };

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation: 'Found code block(s) in Python format',
      searchedFormat: 'Python',
      not: false,
      foundFormats: ['Python'],
      textExcerpt: '```py\nprint("Hello World")\n```',
    });
  });

  it('should return false for non-matching language', async () => {
    const context: PluginContext = {
      response: { text: '```js\nconsole.log("Hello");\n```' },
    };
    const parameters: PluginParameters = {
      format: 'Python',
      not: false,
    };

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: 'No code blocks in Python format found',
      searchedFormat: 'Python',
      not: false,
      foundFormats: ['JavaScript'],
      textExcerpt: '```js\nconsole.log("Hello");\n```',
    });
  });

  it('should handle text without code blocks', async () => {
    const context: PluginContext = {
      response: { text: 'This is just plain text' },
    };
    const parameters: PluginParameters = {
      format: 'Python',
      not: false,
    };

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: 'No code blocks found in the text',
      searchedFormat: 'Python',
      not: false,
      foundFormats: [],
      textExcerpt: 'This is just plain text',
    });
  });

  it('should handle missing format parameter', async () => {
    const context: PluginContext = {
      response: { text: '```py\nprint("Hello")\n```' },
    };
    const parameters: PluginParameters = {};

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error?.message).toBe('Missing required parameter: format');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'Error while checking for code blocks: Missing required parameter: format',
      searchedFormat: undefined,
      not: false,
      textExcerpt: '```py\nprint("Hello")\n```',
    });
  });

  it('should handle multiple code blocks', async () => {
    const context: PluginContext = {
      response: {
        text: '```py\nprint("Hello")\n```\n```js\nconsole.log("Hi");\n```',
      },
    };
    const parameters: PluginParameters = {
      format: 'Python',
      not: false,
    };

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation: 'Found code block(s) in Python format',
      searchedFormat: 'Python',
      not: false,
      foundFormats: ['Python', 'JavaScript'],
      textExcerpt: expect.stringContaining('```py\nprint("Hello")\n```'),
    });
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      format: 'Python',
      not: false,
    };

    const result = await containsCodeHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error?.message).toBe('No text content to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'Error while checking for code blocks: No text content to analyze',
      searchedFormat: 'Python',
      not: false,
      textExcerpt: 'No text available',
    });
  });
});

describe('wordCount handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict and data for word count within range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence with 7 words.' },
    };
    const parameters: PluginParameters = {
      minWords: 5,
      maxWords: 8,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      wordCount: 7,
      minWords: 5,
      maxWords: 8,
      not: false,
      verdict: true,
      explanation:
        'The text contains 7 words, which is within the specified range of 5-8 words.',
      textExcerpt: 'This is a sentence with 7 words.',
    });
  });

  it('should return false verdict and data for word count outside range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence with 7 words.' },
    };
    const parameters: PluginParameters = {
      minWords: 10,
      maxWords: 15,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      wordCount: 7,
      minWords: 10,
      maxWords: 15,
      not: false,
      verdict: false,
      explanation:
        'The text contains 7 words, which is outside the specified range of 10-15 words.',
      textExcerpt: 'This is a sentence with 7 words.',
    });
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'word '.repeat(50); // 50 words
    const context: PluginContext = {
      response: { text: longText },
    };
    const parameters: PluginParameters = {
      minWords: 40,
      maxWords: 60,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103); // 100 chars + '...'
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
    expect(result.data.wordCount).toBe(50);
  });

  it('should handle missing text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      minWords: 1,
      maxWords: 5,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while processing word count: Missing text to analyze',
      minWords: 1,
      maxWords: 5,
      not: false,
      textExcerpt: 'No text available',
    });
  });

  it('should handle invalid word count range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {
      minWords: 'invalid' as any,
      maxWords: 5,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Invalid or missing word count range');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while processing word count: Invalid or missing word count range',
      minWords: 'invalid',
      maxWords: 5,
      not: false,
      textExcerpt: 'This is a test.',
    });
  });

  it('should handle missing word count parameters', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {};

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Invalid or missing word count range');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while processing word count: Invalid or missing word count range',
      minWords: undefined,
      maxWords: undefined,
      not: false,
      textExcerpt: 'This is a test.',
    });
  });

  it('should handle text with only whitespace', async () => {
    const context: PluginContext = {
      response: { text: '   \n\t   ' },
    };
    const parameters: PluginParameters = {
      minWords: 1,
      maxWords: 10,
      not: false,
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while processing word count: Missing text to analyze',
      minWords: 1,
      maxWords: 10,
      not: false,
      textExcerpt: '   \n\t   ',
    });
  });
});

describe('webhook handler', () => {
  const mockContext: PluginContext = {
    request: {
      text: 'test request',
      json: { key: 'value' },
    },
    response: {
      text: 'test response',
      json: { key: 'value' },
    },
  };
  const mockEventType = 'afterRequestHook';

  it('should handle a successful webhook call', async () => {
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/true',
      headers: '{"Authorization": "Bearer test-token"}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toMatchObject({
      verdict: true,
      explanation: 'Webhook request succeeded',
      webhookUrl: 'https://roh26it-blackplanarian.web.val.run/true',
      requestContext: {
        headers: {
          Authorization: 'Bearer test-token',
        },
        timeout: 3000,
      },
    });
  });

  it('should handle a failed webhook call', async () => {
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/false',
      headers: '{"Authorization": "Bearer test-token"}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      verdict: false,
      explanation: 'Webhook request failed',
      webhookUrl: 'https://roh26it-blackplanarian.web.val.run/false',
      requestContext: {
        headers: {
          Authorization: 'Bearer test-token',
        },
        timeout: 3000,
      },
    });
  });

  it('should handle missing webhook URL', async () => {
    const parameters: PluginParameters = {
      headers: '{"Authorization": "Bearer test-token"}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.data.explanation).toContain('Missing webhook URL');
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      explanation: 'Webhook error: Missing webhook URL',
      webhookUrl: 'No URL provided',
      requestContext: {
        headers: parameters.headers,
        timeout: 3000,
      },
    });
  });

  it('should handle invalid webhook URL format', async () => {
    const parameters: PluginParameters = {
      webhookURL: 'not-a-url',
      headers: '{"Authorization": "Bearer test-token"}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.data.explanation).toContain('Invalid webhook URL format');
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      explanation: 'Webhook error: Invalid webhook URL format',
      webhookUrl: 'not-a-url',
      requestContext: {
        headers: parameters.headers,
        timeout: 3000,
      },
    });
  });

  it('should handle invalid headers format', async () => {
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/true',
      headers: '{invalid json}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toContain(
      'Failed to parse headers: Invalid headers format'
    );
    expect(result.verdict).toBe(false);
    expect(result.data).toMatchObject({
      explanation: expect.stringContaining(
        'Webhook error: Failed to parse headers: Invalid headers format'
      ),
      webhookUrl: 'https://roh26it-blackplanarian.web.val.run/true',
      requestContext: {
        headers: {},
        timeout: 3000,
      },
    });
  });

  it('should handle when the webhooks returns an error', async () => {
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/error',
      headers: '{"Authorization": "Bearer test-token"}',
      not: false,
    };

    const result = await webhookHandler(mockContext, parameters, mockEventType);

    expect(result.error).not.toBe(null);
    expect(result.data.explanation).toContain('Webhook error');
    expect(result.verdict).toBe(false);
  });
});

describe('log handler', () => {
  it('should log details to a URL', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      request: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
        json: { key: 'value' },
      },
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
        json: { key: 'value' },
      },
    };
    const parameters: PluginParameters = {
      logURL: 'https://roh26it-upsetharlequinfrog.web.val.run',
      headers: '{"Authorization": "this is some secret"}',
      not: false,
    };

    const result = await logHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
});

describe('allUppercase handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict and data for all uppercase text', async () => {
    const context: PluginContext = {
      response: { text: 'THIS IS ALL UPPERCASE TEXT!' },
    };

    const result = await allUppercaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      verdict: true,
      not: false,
      explanation: 'All alphabetic characters in the text are uppercase.',
      textExcerpt: 'THIS IS ALL UPPERCASE TEXT!',
    });
  });

  it('should return false verdict and data for mixed case text', async () => {
    const context: PluginContext = {
      response: { text: 'This Has Mixed Case.' },
    };

    const result = await allUppercaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      verdict: false,
      not: false,
      explanation: 'The text contains lowercase characters.',
      textExcerpt: 'This Has Mixed Case.',
    });
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'A'.repeat(150);
    const context: PluginContext = {
      response: { text: longText },
    };

    const result = await allUppercaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103);
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };

    const result = await allUppercaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking uppercase: Missing text to analyze',
      not: false,
      textExcerpt: 'No text available',
    });
  });

  it('should handle text with only non-letter characters', async () => {
    const context: PluginContext = {
      response: { text: '123 !@#$%' },
    };

    const result = await allUppercaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      verdict: true,
      not: false,
      explanation: 'All alphabetic characters in the text are uppercase.',
      textExcerpt: '123 !@#$%',
    });
  });
});

describe('allLowercase handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict and data for all lowercase text', async () => {
    const context: PluginContext = {
      response: { text: 'this is all lowercase text!' },
    };

    const result = await allLowerCaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      verdict: true,
      not: false,
      explanation: 'All alphabetic characters in the text are lowercase.',
      textExcerpt: 'this is all lowercase text!',
    });
  });

  it('should return false verdict and data for mixed case text', async () => {
    const context: PluginContext = {
      response: { text: 'This Has Mixed Case.' },
    };

    const result = await allLowerCaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      verdict: false,
      not: false,
      explanation: 'The text contains uppercase characters.',
      textExcerpt: 'This Has Mixed Case.',
    });
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'a'.repeat(150);
    const context: PluginContext = {
      response: { text: longText },
    };

    const result = await allLowerCaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103);
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };

    const result = await allLowerCaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking lowercase: Missing text to analyze',
      not: false,
      textExcerpt: 'No text available',
    });
  });

  it('should handle text with only non-letter characters', async () => {
    const context: PluginContext = {
      response: { text: '123 !@#$%' },
    };

    const result = await allLowerCaseHandler(
      context,
      { not: false },
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      verdict: true,
      not: false,
      explanation: 'All alphabetic characters in the text are lowercase.',
      textExcerpt: '123 !@#$%',
    });
  });
});

describe('modelWhitelist handler', () => {
  const mockEventType = 'beforeRequestHook';

  it('should return true verdict when the model requested is part of the whitelist', async () => {
    const context: PluginContext = {
      request: { json: { model: 'gemini-1.5-flash-001' } },
    };
    const parameters: PluginParameters = {
      models: ['gemini-1.5-flash-001'],
      not: false,
    };

    const result = await modelWhitelistHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      verdict: true,
      not: false,
      explanation: 'Model "gemini-1.5-flash-001" is allowed.',
      requestedModel: 'gemini-1.5-flash-001',
      allowedModels: ['gemini-1.5-flash-001'],
    });
  });

  it('should return false verdict when the model requested is not part of the whitelist', async () => {
    const context: PluginContext = {
      request: { json: { model: 'gemini-1.5-pro-001' } },
    };
    const parameters: PluginParameters = {
      models: ['gemini-1.5-flash-001'],
      not: false,
    };

    const result = await modelWhitelistHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      verdict: false,
      not: false,
      explanation: 'Model "gemini-1.5-pro-001" is not in the allowed list.',
      requestedModel: 'gemini-1.5-pro-001',
      allowedModels: ['gemini-1.5-flash-001'],
    });
  });

  it('should handle missing model whitelist', async () => {
    const context: PluginContext = {
      request: { json: { model: 'gemini-1.5-pro-001' } },
    };
    const parameters: PluginParameters = {};

    const result = await modelWhitelistHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error?.message).toBe('Missing or invalid model whitelist');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking model whitelist: Missing or invalid model whitelist',
      requestedModel: 'gemini-1.5-pro-001',
      not: false,
      allowedModels: [],
    });
  });

  it('should handle missing model in request', async () => {
    const context: PluginContext = {
      request: { json: {} },
    };
    const parameters: PluginParameters = {
      models: ['gemini-1.5-flash-001'],
      not: false,
    };

    const result = await modelWhitelistHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error?.message).toBe('Missing model in request');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking model whitelist: Missing model in request',
      requestedModel: 'No model specified',
      not: false,
      allowedModels: ['gemini-1.5-flash-001'],
    });
  });
});

describe('characterCount handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict and data for character count within range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {
      minCharacters: 10,
      maxCharacters: 20,
      not: false,
    };

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      characterCount: 15,
      minCharacters: 10,
      maxCharacters: 20,
      not: false,
      verdict: true,
      explanation:
        'The text contains 15 characters, which is within the specified range of 10-20 characters.',
      textExcerpt: 'This is a test.',
    });
  });

  it('should return false verdict and data for character count outside range', async () => {
    const context: PluginContext = {
      response: { text: 'This is a very long test that exceeds the limit.' },
    };
    const parameters: PluginParameters = {
      minCharacters: 10,
      maxCharacters: 20,
      not: false,
    };

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      characterCount: 48,
      minCharacters: 10,
      maxCharacters: 20,
      not: false,
      verdict: false,
      explanation:
        'The text contains 48 characters, which is outside the specified range of 10-20 characters.',
      textExcerpt: 'This is a very long test that exceeds the limit.',
    });
  });

  it('should handle long text by truncating excerpt', async () => {
    const longText = 'a'.repeat(150);
    const context: PluginContext = {
      response: { text: longText },
    };
    const parameters: PluginParameters = {
      minCharacters: 100,
      maxCharacters: 200,
      not: false,
    };

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data.textExcerpt.length).toBeLessThanOrEqual(103); // 100 chars + '...'
    expect(result.data.textExcerpt.endsWith('...')).toBe(true);
    expect(result.data.characterCount).toBe(150);
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      minCharacters: 1,
      maxCharacters: 10,
      not: false,
    };

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while counting characters: Missing text to analyze',
      minCharacters: 1,
      maxCharacters: 10,
      not: false,
      textExcerpt: 'No text available',
    });
  });

  it('should handle missing character count parameters', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {};

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBe(null);
    expect(result.error?.message).toBe(
      'Invalid or missing character count range'
    );
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while counting characters: Invalid or missing character count range',
      minCharacters: undefined,
      maxCharacters: undefined,
      not: false,
      textExcerpt: 'This is a test.',
    });
  });

  it('should handle text with only whitespace', async () => {
    const context: PluginContext = {
      response: { text: '   \n\t   ' },
    };
    const parameters: PluginParameters = {
      minCharacters: 1,
      maxCharacters: 10,
      not: false,
    };

    const result = await characterCountHandler(
      context,
      parameters,
      mockEventType
    );

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation:
        'The text contains 8 characters, which is within the specified range of 1-10 characters.',
      minCharacters: 1,
      maxCharacters: 10,
      not: false,
      textExcerpt: '   \n\t   ',
      verdict: true,
      characterCount: 8,
    });
  });
});

describe('endsWith handler', () => {
  const mockEventType = 'afterRequestHook';

  it('should return true verdict and data when text ends with suffix', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test ending with HarryPortkey' },
    };
    const parameters: PluginParameters = {
      suffix: 'HarryPortkey',
      not: false,
    };

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      suffix: 'HarryPortkey',
      not: false,
      verdict: true,
      explanation: 'The text ends with "HarryPortkey".',
      textExcerpt: 'This is a test ending with HarryPortkey',
    });
  });

  it('should return true verdict and data when text ends with suffix and period', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test ending with HarryPortkey.' },
    };
    const parameters: PluginParameters = {
      suffix: 'HarryPortkey',
      not: false,
    };

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      suffix: 'HarryPortkey',
      not: false,
      verdict: true,
      explanation:
        'The text ends with "HarryPortkey" (including trailing period).',
      textExcerpt: 'This is a test ending with HarryPortkey.',
    });
  });

  it('should return false verdict and data when text does not end with suffix', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test ending with something else' },
    };
    const parameters: PluginParameters = {
      suffix: 'HarryPortkey',
      not: false,
    };

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      suffix: 'HarryPortkey',
      not: false,
      verdict: false,
      explanation: 'The text does not end with "HarryPortkey".',
      textExcerpt: 'This is a test ending with something else',
    });
  });

  it('should handle empty text', async () => {
    const context: PluginContext = {
      response: { text: '' },
    };
    const parameters: PluginParameters = {
      suffix: 'test',
      not: false,
    };

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error?.message).toBe('Missing text to analyze');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking suffix: Missing text to analyze',
      suffix: 'test',
      not: false,
      textExcerpt: 'No text available',
    });
  });

  it('should handle missing suffix parameter', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {};

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error?.message).toBe('Missing or empty suffix');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking suffix: Missing or empty suffix',
      suffix: undefined,
      not: false,
      textExcerpt: 'This is a test.',
    });
  });

  it('should handle empty suffix parameter', async () => {
    const context: PluginContext = {
      response: { text: 'This is a test.' },
    };
    const parameters: PluginParameters = {
      suffix: '',
      not: false,
    };

    const result = await endsWithHandler(context, parameters, mockEventType);

    expect(result.error?.message).toBe('Missing or empty suffix');
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation:
        'An error occurred while checking suffix: Missing or empty suffix',
      suffix: '',
      not: false,
      textExcerpt: 'This is a test.',
    });
  });
});
