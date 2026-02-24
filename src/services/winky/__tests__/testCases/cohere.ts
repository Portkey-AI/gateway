import { TestCase } from '../types';

export const COHERE_TEST_CASES: TestCase[] = [
  {
    provider: 'cohere',
    model: 'command-r-plus',
    description: 'Command R+ text completion',
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
      requestCost: 0.25, // $2.50/1M = $0.00025 per token * 1000
      responseCost: 1.0, // $10.00/1M = $0.001 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'cohere',
    model: 'command-r',
    description: 'Command R text completion',
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
      requestCost: 0.015, // $0.15/1M = $0.000015 per token * 1000
      responseCost: 0.06, // $0.60/1M = $0.00006 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'cohere',
    model: 'command-r7b',
    description: 'Command R7B text completion',
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
      requestCost: 0.00375, // $0.0375/1M = $0.00000375 per token * 1000
      responseCost: 0.015, // $0.15/1M = $0.000015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'cohere',
    model: 'rerank-v3.5',
    description: 'Rerank 3.5 search',
    tokens: {
      reqUnits: 1000,
      resUnits: 0,
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
      requestCost: 200, // $2.00/1K searches * 1
      responseCost: 0,
      currency: 'USD',
    },
  },
  {
    provider: 'cohere',
    model: 'embed-english-v3.0',
    description: 'Embed 3 text embedding',
    tokens: {
      reqUnits: 1000,
      resUnits: 0,
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
      requestCost: 0.01, // $0.10/1M = $0.00001 per token * 1000
      responseCost: 0,
      currency: 'USD',
    },
  },
  // {
  //   provider: 'cohere',
  //   model: 'embed-3',
  //   description: 'Embed 3 image embedding',
  //   input: { tokens: 1000 },
  //   output: { tokens: 0 },
  //   expected: {
  //     requestCost: 0.0001, // $0.0001 per image
  //     responseCost: 0,
  //     currency: 'USD',
  //   },
  // },
];
