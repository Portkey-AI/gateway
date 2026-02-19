import { TestCase } from '../types';

export const FIREWORKS_TEST_CASES: TestCase[] = [
  {
    provider: 'fireworks-ai',
    model: 'mixtral-8x7b',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.05, // $0.00005 per token * 1000
      responseCost: 0.05, // $0.00005 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'mixtral-8x22b-instruct',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.12, // $0.00012 per token * 1000
      responseCost: 0.12, // $0.00012 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'dbrx-instruct',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.12, // $0.00012 per token * 1000
      responseCost: 0.12, // $0.00012 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: '4b',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.01, // $0.00001 per token * 1000
      responseCost: 0.01, // $0.00001 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: '16b',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.02, // $0.00002 per token * 1000
      responseCost: 0.02, // $0.00002 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: '100b',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.09, // $0.00009 per token * 1000
      responseCost: 0.09, // $0.00009 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'nomic-ai/nomic-embed-text-v1.5',
    description: 'embedding request',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.0008, // $0.0000008 per token * 1000
      responseCost: 0.0008, // $0.0000008 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'nomic-ai/nomic-embed-text-v1',
    description: 'embedding request',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.0008, // $0.0000008 per token * 1000
      responseCost: 0.0008, // $0.0000008 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'thenlper/gte-base',
    description: 'embedding request',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.0008, // $0.0000008 per token * 1000
      responseCost: 0.0008, // $0.0000008 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'WhereIsAI/UAE-Large-V1',
    description: 'embedding request',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.0016, // $0.0000016 per token * 1000
      responseCost: 0.0016, // $0.0000016 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'thenlper/gte-large',
    description: 'embedding request',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.0016, // $0.0000016 per token * 1000
      responseCost: 0.0016, // $0.0000016 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'fireworks-ai',
    model: 'llama-v3p1-405b-instruct',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.3, // $0.0003 per token * 1000
      responseCost: 0.3, // $0.0003 per token * 1000
      currency: 'USD',
    },
  },
];
