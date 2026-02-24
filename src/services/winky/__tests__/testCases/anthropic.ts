import { TestCase } from '../types';

export const ANTHROPIC_TEST_CASES: TestCase[] = [
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
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
      requestCost: 0.3, // ¢0.0003 per token * 1000
      responseCost: 1.5, // ¢0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
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
      requestCost: 0.3, // ¢0.0003 per token * 1000
      responseCost: 1.5, // ¢0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
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
      requestCost: 0.08, // ¢0.00008 per token * 1000
      responseCost: 0.4, // ¢0.0004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-latest',
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
      requestCost: 0.08, // ¢0.00008 per token * 1000
      responseCost: 0.4, // ¢0.0004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
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
      requestCost: 1.5, // ¢0.0015 per token * 1000
      responseCost: 7.5, // ¢0.0075 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-latest',
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
      requestCost: 1.5, // ¢0.0015 per token * 1000
      responseCost: 7.5, // ¢0.0075 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
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
      requestCost: 0.3, // ¢0.0003 per token * 1000
      responseCost: 1.5, // ¢0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
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
      requestCost: 0.025, // ¢0.000025 per token * 1000
      responseCost: 0.125, // ¢0.000125 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    description: 'full cache read',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 1000,
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
      requestCost: 0.03, // $0.30/MTok = $0.00003 per token * 1000
      responseCost: 1.5, // $15/MTok = $0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    description: 'full cache write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 1000,
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
      requestCost: 0.375, // Only cache write: $3.75/MTok = $0.000375 * 1000
      responseCost: 1.5,
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    description: 'mixed cache read/write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 500,
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
      requestCost: 0.2025, // ($0.00003 * 500) + ($0.000375 * 500)
      responseCost: 1.5,
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    description: 'full cache read',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 1000,
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
      requestCost: 0.008, // $0.08/MTok = $0.000008 per token * 1000
      responseCost: 0.4, // $4/MTok = $0.0004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    description: 'full cache write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 1000,
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
      requestCost: 0.1, // $1/MTok = $0.0001 per token * 1000
      responseCost: 0.4, // $4/MTok = $0.0004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    description: 'mixed cache read/write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 500,
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
      requestCost: 0.054, // ($0.000008 * 500) + ($0.0001 * 500)
      responseCost: 0.4, // $4/MTok = $0.0004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    description: 'full cache read',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 1000,
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
      requestCost: 0.15, // $1.50/MTok = $0.00015 per token * 1000
      responseCost: 7.5, // $75/MTok = $0.0075 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    description: 'full cache write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 1000,
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
      requestCost: 1.875, // $18.75/MTok = $0.001875 per token * 1000
      responseCost: 7.5, // $75/MTok = $0.0075 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    description: 'mixed cache read/write',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 500,
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
      requestCost: 1.0125, // ($0.00015 * 500) + ($0.001875 * 500)
      responseCost: 7.5, // $75/MTok = $0.0075 per token * 1000
      currency: 'USD',
    },
  },
];
