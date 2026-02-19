// Mock environment variables
// process.env.SERVICE_NAME = 'test';
// process.env.ENVIRONMENT = 'test';
// process.env.LOKI_HOST = 'http://localhost';

import { calculateCost } from '../lookers/cost';
import { expect, describe, test } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OPENAI_TEST_CASES } from './testCases/openai';
import { ANTHROPIC_TEST_CASES } from './testCases/anthropic';
import { COHERE_TEST_CASES } from './testCases/cohere';
import { AI21_TEST_CASES } from './testCases/ai21';
import { FIREWORKS_TEST_CASES } from './testCases/fireworksAi';
import { BEDROCK_TEST_CASES } from './testCases/bedrock';
import { GOOGLE_TEST_CASES } from './testCases/google';
import { XAI_TEST_CASES } from './testCases/xai';
import { TestCase } from './types';

// Combine all test cases from different providers
const TEST_CASES: TestCase[] = [
  ...OPENAI_TEST_CASES,
  ...ANTHROPIC_TEST_CASES,
  ...COHERE_TEST_CASES,
  ...AI21_TEST_CASES,
  ...FIREWORKS_TEST_CASES,
  ...BEDROCK_TEST_CASES,
  ...GOOGLE_TEST_CASES,
  ...XAI_TEST_CASES,
  // Add other provider test cases here as they're created
  // ...CLAUDE_TEST_CASES,
];

// Load all provider configs
const providerConfigs: Record<string, any> = {
  openai: JSON.parse(
    readFileSync(join(__dirname, '../configs/openai.json'), 'utf-8')
  ),
  anthropic: JSON.parse(
    readFileSync(join(__dirname, '../configs/anthropic.json'), 'utf-8')
  ),
  cohere: JSON.parse(
    readFileSync(join(__dirname, '../configs/cohere.json'), 'utf-8')
  ),
  ai21: JSON.parse(
    readFileSync(join(__dirname, '../configs/ai21.json'), 'utf-8')
  ),
  'fireworks-ai': JSON.parse(
    readFileSync(join(__dirname, '../configs/fireworks-ai.json'), 'utf-8')
  ),
  bedrock: JSON.parse(
    readFileSync(join(__dirname, '../configs/bedrock.json'), 'utf-8')
  ),
  google: JSON.parse(
    readFileSync(join(__dirname, '../configs/google.json'), 'utf-8')
  ),
  'x-ai': JSON.parse(
    readFileSync(join(__dirname, '../configs/x-ai.json'), 'utf-8')
  ),
  // Add other provider configs here as needed
};

describe('calculateCost', () => {
  TEST_CASES.forEach((testCase) => {
    test(`${testCase.provider}/${testCase.model}: ${testCase.description}`, () => {
      const config = providerConfigs[testCase.provider];
      const defaultConfig = config.default.pricing_config;
      const modelConfig = config[testCase.model].pricing_config;

      // Merge configs
      const priceConfig = {
        ...defaultConfig,
        pay_as_you_go: {
          ...defaultConfig.pay_as_you_go,
          ...modelConfig.pay_as_you_go,
        },
      };

      const result = calculateCost(
        testCase.tokens,
        priceConfig,
        testCase.requestBody,
        true
      );
      expect({
        requestCost: Number(result.requestCost.toFixed(6)),
        responseCost: Number(result.responseCost.toFixed(6)),
        currency: result.currency,
      }).toEqual(testCase.expected);
    });
  });
});
