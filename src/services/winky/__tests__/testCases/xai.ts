import { TestCase } from '../types';

export const XAI_TEST_CASES: TestCase[] = [
  {
    provider: 'x-ai',
    model: 'grok-beta',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.5, // $0.0005 per token * 1000
      responseCost: 1.5, // $0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'x-ai',
    model: 'grok-2',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.2, // $0.0002 per token * 1000
      responseCost: 1.0, // $0.001 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'x-ai',
    model: 'grok-2-1212',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.2, // $0.0002 per token * 1000
      responseCost: 1.0, // $0.001 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'x-ai',
    model: 'grok-3',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.3, // $0.0003 per token * 1000
      responseCost: 1.5, // $0.0015 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'x-ai',
    model: 'grok-3-mini',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.03, // $0.00003 per token * 1000
      responseCost: 0.05, // $0.00005 per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'x-ai',
    model: 'grok-4',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
    },
    requestBody: {},
    expected: {
      requestCost: 0.3, // $0.0003 per token * 1000
      responseCost: 1.5, // $0.0015 per token * 1000
      currency: 'USD',
    },
  },
];
