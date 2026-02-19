import { TestCase } from '../types';

export const BEDROCK_TEST_CASES: TestCase[] = [
  // input caching
  {
    provider: 'bedrock',
    model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1100,
      resUnits: 1000,
      cacheReadInputUnits: 1000,
      cacheWriteInputUnits: 100,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.018, // $0.00002 per token * 1000
      responseCost: 0.4, // $0.00004 per token * 1000
      currency: 'USD',
    },
  },
  // some tokens not cached
  {
    provider: 'bedrock',
    model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    description: 'standard text completion',
    tokens: {
      reqUnits: 2100,
      resUnits: 1000,
      cacheReadInputUnits: 1000,
      cacheWriteInputUnits: 100,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.098, // $0.00002 per token * 1000
      responseCost: 0.4, // $0.00004 per token * 1000
      currency: 'USD',
    },
  },
  // image generation
  {
    provider: 'bedrock',
    model: 'stability.stable-diffusion-xl-v1',
    description: 'image generation',
    tokens: {
      reqUnits: 1,
      resUnits: 1,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.0, // $0.00002 per token * 1000
      responseCost: 4, // $0.00004 per token * 1000
      currency: 'USD',
    },
  },
];
