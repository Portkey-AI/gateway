import { TestCase } from '../types';

export const AI21_TEST_CASES: TestCase[] = [
  {
    provider: 'ai21',
    model: 'jamba-1.5-mini',
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
      responseCost: 0.04, // $0.00004 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'ai21',
    model: 'jamba-1.5-mini',
    description: 'large text completion',
    tokens: {
      reqUnits: 10000,
      resUnits: 5000,
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
      requestCost: 0.2, // $0.00002 per token * 10000
      responseCost: 0.2, // $0.00004 per token * 5000
      currency: 'USD',
    },
  },
  {
    provider: 'ai21',
    model: 'jamba-1.5-large',
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
      requestCost: 0.2, // $0.0002 per token * 1000
      responseCost: 0.8, // $0.0008 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'ai21',
    model: 'jamba-1.5-large',
    description: 'large text completion',
    tokens: {
      reqUnits: 10000,
      resUnits: 5000,
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
      requestCost: 2.0, // $0.0002 per token * 10000
      responseCost: 4.0, // $0.0008 per token * 5000
      currency: 'USD',
    },
  },
];
