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
    const parameters: PluginParameters = { rule: 'quick.*fox' };
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
    const parameters: PluginParameters = { rule: 'zebra' };
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
    const parameters: PluginParameters = { rule: '(quick) (brown) (fox)' };
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
    const parameters: PluginParameters = { rule: 'dog' };
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
    const parameters: PluginParameters = { rule: 'a' };
    const result = await regexMatchHandler(
      longTextContext,
      parameters,
      mockEventType
    );

    expect(result.data.textExcerpt).toBe('a'.repeat(100) + '...');
  });

  it('should throw error for invalid regex', async () => {
    const parameters: PluginParameters = { rule: '(' }; // Invalid regex
    const result = await regexMatchHandler(
      mockContext,
      parameters,
      mockEventType
    );

    expect(result.error).not.toBeNull();
    expect(result.data.explanation).toContain('An error occurred');
  });

  it('should handle missing regex pattern', async () => {
    const parameters: PluginParameters = { rule: '' };
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
    const parameters: PluginParameters = { rule: 'test' };
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
      schema: z.object({ key: z.string() }),
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key: 'value' });
    expect(result.data.explanation).toContain('Successfully validated');
  });

  it('should validate JSON in response text - complex', async () => {
    const context: PluginContext = {
      response: {
        text: '```json\n{\n  "title": "The Rise of AI Agents: Transforming the Future",\n  "short_intro": "Artificial Intelligence (AI) agents are revolutionizing various sectors, from healthcare to finance. In this blog, we explore the development of AI agents, their applications, and their potential to reshape our world."\n}\n```',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      schema: z.object({ title: z.string(), short_intro: z.string() }),
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
      schema: z.object({ title: z.string(), short_intro: z.string() }),
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
      schema: z.object({ key: z.string() }),
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
      schema: z.object({ key: z.string() }),
    };

    const result = await jsonSchemaHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('No valid JSON found');
  });
});

describe('jsonKeys handler', () => {
  it('should validate JSON with "any" operator', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1", "key2": "value2"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key1', 'key3'],
      operator: 'any',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key1: 'value1', key2: 'value2' });
    expect(result.data.explanation).toContain('Successfully matched');
    expect(result.data.presentKeys).toContain('key1');
    expect(result.data.missingKeys).toContain('key3');
  });

  it('should validate JSON with "all" operator', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1", "key2": "value2"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key1', 'key2'],
      operator: 'all',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key1: 'value1', key2: 'value2' });
    expect(result.data.explanation).toContain('Successfully matched');
    expect(result.data.presentKeys).toEqual(['key1', 'key2']);
    expect(result.data.missingKeys).toEqual([]);
  });

  it('should validate JSON with "none" operator', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1", "key2": "value2"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key3', 'key4'],
      operator: 'none',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key1: 'value1', key2: 'value2' });
    expect(result.data.explanation).toContain('Successfully matched');
    expect(result.data.presentKeys).toEqual([]);
    expect(result.data.missingKeys).toEqual(['key3', 'key4']);
  });

  it('should handle JSON in code blocks', async () => {
    const context: PluginContext = {
      response: {
        text: '```json\n{"key1": "value1", "key2": "value2"}\n```',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key1', 'key2'],
      operator: 'all',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key1: 'value1', key2: 'value2' });
    expect(result.data.explanation).toContain('Successfully matched');
  });

  it('should return false verdict when keys are not found', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1", "key2": "value2"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key3', 'key4'],
      operator: 'any',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('Failed to match');
    expect(result.data.presentKeys).toEqual([]);
    expect(result.data.missingKeys).toEqual(['key3', 'key4']);
  });

  it('should handle multiple JSON objects in text', async () => {
    const context: PluginContext = {
      response: {
        text: '{"key1": "value1"} Some text {"key2": "value2", "key3": "value3"}',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key2', 'key3'],
      operator: 'all',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.matchedJson).toEqual({ key2: 'value2', key3: 'value3' });
    expect(result.data.explanation).toContain('Successfully matched');
  });

  it('should return explanation when no valid JSON is found', async () => {
    const context: PluginContext = {
      response: {
        text: 'This is just plain text with no JSON',
      },
    };
    const eventType = 'afterRequestHook';
    const parameters: PluginParameters = {
      keys: ['key1', 'key2'],
      operator: 'any',
    };

    const result = await jsonKeysHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data.explanation).toContain('No valid JSON found');
    expect(result.data.operator).toBe('any');
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
  it('should return true verdict for valid URLs in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this https://example.com and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      onlyDNS: false,
    };

    const result = await validUrlsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });

  it('should return false verdict for invalid URLs in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this https://invalidurl.cm and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      onlyDNS: false,
    };

    const result = await validUrlsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });

  it('should return true verdict for URLs with valid DNS in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this https://portkey.ai and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      onlyDNS: true,
    };

    const result = await validUrlsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });

  it('should return false verdict for URLs with invalid DNS in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this https://invalidurl.com and adding some text after',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      onlyDNS: true,
    };

    const result = await validUrlsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });

  it('should return true verdict for URLs with valid DNS and invalid URL in response text', async () => {
    const context: PluginContext = {
      response: {
        text: 'adding some text before this https://example.com and adding some text after https://invalidurl.com',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      onlyDNS: true,
    };

    const result = await validUrlsHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
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
      verdict: false,
      explanation:
        'The sentence count (0) is outside the specified range of 1 to 3.',
      textExcerpt: '',
    });
  });
});

describe('containsCode handler', () => {
  it('should return true verdict for format in code block in response text', async () => {
    const context: PluginContext = {
      response: { text: '```js\nconsole.log("Hello, World!");\n```' },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      format: 'JavaScript',
    };

    const result = await containsCodeHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });

  it('should return false verdict for format not in code block in response text', async () => {
    const context: PluginContext = {
      response: { text: '```py\nprint("Hello, World!")\n```' },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      format: 'JavaScript',
    };

    const result = await containsCodeHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });

  it('should return data for no code block in response text', async () => {
    const context: PluginContext = {
      response: { text: 'No code block found in the response text.' },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      format: 'JavaScript',
    };

    const result = await containsCodeHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      message: 'No code block found in the response text.',
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
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      wordCount: 7,
      minWords: 5,
      maxWords: 8,
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
    };

    const result = await wordCountHandler(context, parameters, mockEventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      wordCount: 7,
      minWords: 10,
      maxWords: 15,
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
      textExcerpt: 'This is a test.',
    });
  });
});

describe('webhook handler', () => {
  it('should handle a postive result from a webhook', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
      },
    };
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/true',
    };

    const result = await webhookHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual(context);
  });

  it('should handle a negative result from a webhook', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
      },
    };
    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/false',
    };

    const result = await webhookHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
    expect(result.data).toEqual(context);
  });

  it('should handle an error from a webhook', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
      },
    };

    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/error',
    };

    const result = await webhookHandler(context, parameters, eventType);

    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.data).toBe(null);
  });

  it('should handle a timeout from a webhook', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      response: {
        text: `adding some text before this \`\`\`json\n{"key1": "value"}\n\`\`\`\n and adding some text after {"key":"value"}`,
      },
    };

    const parameters: PluginParameters = {
      webhookURL: 'https://roh26it-blackplanarian.web.val.run/timeout',
    };

    const result = await webhookHandler(context, parameters, eventType);

    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.data).toBe(null);
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
    };

    const result = await logHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
});

describe('allUppercase handler', () => {
  it('should return true verdict for a sentence with all uppercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'THIS IS A SENTENCE. THIS IS ANOTHER SENTENCE.' },
    };
    const eventType = 'afterRequestHook';

    const result = await allUppercaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict for a sentence with not all uppercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence. This is another sentence' },
    };
    const eventType = 'afterRequestHook';

    const result = await allUppercaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });
});
describe('endsWith handler', () => {
  it('should return true verdict if response ends with provided suffix', async () => {
    const eventType = 'afterRequestHook';
    const context: PluginContext = {
      response: {
        text: 'This is a sentence that ends with the expected word i.e. HarryPortkey.',
      },
    };
    const parameters: PluginParameters = {
      suffix: 'HarryPortkey',
    };
    const result = await endsWithHandler(context, parameters, eventType);
    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict if response not ending with provided suffix', async () => {
    const context: PluginContext = {
      response: {
        text: 'This is a sentence ending with wrong word i.e. MalfoyPortkey.',
      },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {
      suffix: 'HarryPortkey',
    };

    const result = await endsWithHandler(context, parameters, eventType);
    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });

  it('should return error for missing suffix in parameters', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence which ends with Portkey.' },
    };
    const eventType = 'afterRequestHook';

    const parameters: PluginParameters = {};

    const result = await endsWithHandler(context, parameters, eventType);

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Missing suffix or text');
    expect(result.verdict).toBe(false);
    expect(result.data).toBe(null);
  });
});

describe('allLowercase handler', () => {
  it('should return true verdict for a sentence with all lowercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'this is a sentence. this is another sentence' },
    };
    const eventType = 'afterRequestHook';

    const result = await allLowerCaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict for a sentence with not all lowercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'THIS IS A SENTENCE. THIS IS ANOTHER SENTENCE.' },
    };
    const eventType = 'afterRequestHook';

    const result = await allLowerCaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });
  it('should return true verdict for a sentence with all lowercase characters', async () => {
    const context: PluginContext = {
      request: { text: 'this is a sentence. this is another sentence' },
    };
    const eventType = 'beforeRequestHook';

    const result = await allLowerCaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict for a sentence with not all lowercase characters', async () => {
    const context: PluginContext = {
      request: { text: 'THIS IS A SENTENCE. THIS IS ANOTHER SENTENCE.' },
    };
    const eventType = 'beforeRequestHook';

    const result = await allLowerCaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });
});

describe('modelWhitelist handler', () => {
  it('should return true verdict when the model requested is part of the whitelist', async () => {
    const context: PluginContext = {
      request: { json: { model: 'gemini-1.5-flash-001' } },
    };

    const parameters: PluginParameters = {
      models: ['gemini-1.5-flash-001'],
    };
    const eventType = 'beforeRequestHook';

    const result = await modelWhitelistHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict when the model requested is not part of the whitelist', async () => {
    const context: PluginContext = {
      request: { json: { model: 'gemini-1.5-pro-001' } },
    };

    const parameters: PluginParameters = {
      models: ['gemini-1.5-flash-001'],
    };
    const eventType = 'beforeRequestHook';

    const result = await modelWhitelistHandler(context, parameters, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });
});
