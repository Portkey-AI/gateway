import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { PORTKEY_ENDPOINTS, fetchPortkey } from './globals';

interface BooleanExpectedResult {
  type: 'boolean';
  booleanResult: boolean;
}

interface ChoiceExpectedResult {
  type: 'choice';
  choices: string[] | string;
  caseSensitive?: boolean; // Default: false
}

interface JsonMatchExpectedResult {
  type: 'jsonMatch';
  jsonMatch: Record<string, string | string[]>; // dot notation keys and expected string values or array of choices
  // Customizations for string matching within each key
  caseSensitive?: boolean; // Whether to match case exactly for all keys
  // JSON structure options
  maxDepth?: number; // How deep to traverse JSON structure
  requiredKeys?: string[]; // Keys that must be present
  optionalKeys?: string[]; // Keys that are optional
  allowExtraKeys?: boolean; // Whether to allow extra keys, default: true
}

interface ScoreExpectedResult {
  type: 'score';
  score: number;
  // Customizations
  minScore?: number; // Minimum acceptable score
  maxScore?: number; // Maximum acceptable score
  precision?: number; // Number of decimal places to consider
  comparison?:
    | 'equals'
    | 'greaterThan'
    | 'lessThan'
    | 'greaterThanOrEqual'
    | 'lessThanOrEqual';
  normalized?: boolean; // Whether score is normalized to 0-1 range
  tolerance?: number; // Acceptable deviation from target score
}

interface RegexExpectedResult {
  type: 'regex';
  regex: string | string[];
  // Customizations
  flags?: string; // Regex flags (i, m, g, etc.)
  matchStrategy?: 'any' | 'all'; // Whether ANY or ALL patterns must match
  caseInsensitive?: boolean; // Case insensitive matching (alternative to flags)
}

type ExpectedResult =
  | BooleanExpectedResult
  | ChoiceExpectedResult
  | JsonMatchExpectedResult
  | ScoreExpectedResult
  | RegexExpectedResult;

type VerdictCheckResult = {
  verdict: boolean;
  data?: any;
  error?: Error;
};

class VerdictChecker {
  private completionText: string;
  private expectedResult: ExpectedResult;
  private type: string;

  constructor(
    completionText: string,
    expectedResult: ExpectedResult,
    type: string
  ) {
    this.completionText = completionText;
    this.expectedResult = expectedResult;
    this.type = type;
  }

  check(): VerdictCheckResult {
    switch (this.type) {
      case 'boolean':
        const booleanResult = this.boolean();
        return {
          verdict: booleanResult,
          data: {
            explanation: booleanResult
              ? 'The completion text matches the expected result.'
              : 'The completion text does not match the expected result.',
            expectedResult: this.expectedResult,
          },
        };
      default:
        return {
          verdict: false,
          data: {
            explanation: 'Unsupported verdict type.',
          },
        };
    }
  }

  boolean() {
    this.expectedResult = this.expectedResult as BooleanExpectedResult;
    return this.completionText
      .toLowerCase()
      .includes(this.expectedResult.booleanResult.toString().toLowerCase());
  }

  choices() {
    this.expectedResult = this.expectedResult as ChoiceExpectedResult;
    let choices = Array.isArray(this.expectedResult.choices)
      ? this.expectedResult.choices
      : [this.expectedResult.choices];
    if (!this.expectedResult.caseSensitive) {
      choices = choices.map((choice) => choice.toLowerCase());
      this.completionText = this.completionText.toLowerCase();
    }
    return choices.includes(this.completionText);
  }

  jsonMatch() {
    this.expectedResult = this.expectedResult as JsonMatchExpectedResult;
    const jsonMatch = JSON.parse(this.completionText);
    const keys = Object.keys(this.expectedResult.jsonMatch);
    for (const key of keys) {
      const expectedValue = this.expectedResult.jsonMatch[key];
    }
  }
}

const getPromptCompletion = async (
  promptId: string,
  variables: Record<string, string>,
  credentials: Record<string, string>
) => {
  const response = await fetch(
    `${process.env.PORTKEY_API_URL}/prompts/${promptId}/completions`,
    {
      method: 'POST',
      body: JSON.stringify({ variables }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
    }
  );
  return response.json();
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  // Construct variables for the prompt based on the parameters
  const variables = {
    ...parameters.variables,
    request_text: context.request?.text,
    metadata: context.metadata,
  };

  if (eventType === 'afterRequestHook') {
    variables.response_text = context.response?.text;
  }

  try {
    console.log('Getting prompt completion');
    const responseJson: any = await getPromptCompletion(
      parameters.promptId,
      variables,
      parameters.credentials || {}
    );
    console.log('Prompt completion received', responseJson.choices[0].message);
    const result = new VerdictChecker(
      responseJson.choices[0].message.content,
      parameters.expectedResult,
      parameters.verdictType
    ).check();
    console.log('Verdict check result', result);
    verdict = result.verdict;
    data = result.data;
  } catch (e) {
    error = e;
  }

  return { error, verdict, data };
};
