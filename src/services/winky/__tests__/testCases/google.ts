import { TestCase } from '../types';

export const GOOGLE_TEST_CASES: TestCase[] = [
  // tokens less than or equal to 128k
  {
    provider: 'google',
    model: 'gemini-1.5-pro-lte-128k',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 50,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.125,
      responseCost: 0.025,
      currency: 'USD',
    },
  },
  // tokens greater than 128k
  {
    provider: 'google',
    model: 'gemini-1.5-pro-gt-128k',
    description: 'standard text completion',
    tokens: {
      reqUnits: 200000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 50,
      responseCost: 1,
      currency: 'USD',
    },
  },
];
