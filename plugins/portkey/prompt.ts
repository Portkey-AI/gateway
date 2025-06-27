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
      case 'choice':
        return this.choices();
      case 'jsonMatch':
        return this.jsonMatch();
      case 'score':
        return this.score();
      case 'regex':
        return this.regex();
    }
  }

  boolean() {
    this.expectedResult = this.expectedResult as BooleanExpectedResult;
    return this.completionText === this.expectedResult.booleanResult.toString();
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
  variables: Record<string, string>
) => {
  const response = await fetch(
    `${process.env.PORTKEY_API_URL}/prompts/${promptId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ variables }),
    }
  );
  return response.json();
};

const checkJsonMatchVerdict = (
  completionText: string,
  expectedResult: JsonMatchExpectedResult
) => {};

const findVerdict = async (
  completion: any,
  verdictKind: string,
  expectedResult: any
) => {
  const completionText = completion.choices[0].message.content;
  switch (verdictKind) {
    case 'boolean':
      return completionText === expectedResult.booleanResult.toString();
    case 'choice':
      return completionText === expectedResult.choice;
    case 'jsonMatch':
  }
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

  try {
    const text = getText(context, eventType);
    const categories = parameters.categories;
    const not = parameters.not || false;

    const result: any = await fetchPortkey(
      options?.env || {},
      PORTKEY_ENDPOINTS.MODERATIONS,
      parameters.credentials,
      { input: text },
      parameters.timeout
    );

    const categoriesFlagged = Object.keys(result.results[0].categories).filter(
      (category) => result.results[0].categories[category]
    );

    const intersection = categoriesFlagged.filter((category) =>
      categories.includes(category)
    );

    const hasRestrictedContent = intersection.length > 0;
    verdict = not ? hasRestrictedContent : !hasRestrictedContent;

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? 'Found restricted content categories as expected.'
          : 'No restricted content categories were found.'
        : not
          ? 'No restricted content categories were found when they should have been.'
          : `Found restricted content categories: ${intersection.join(', ')}`,
      flaggedCategories: intersection,
      restrictedCategories: categories,
      allFlaggedCategories: categoriesFlagged,
      moderationResults: result.results[0],
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e) {
    error = e as Error;
    const text = getText(context, eventType);
    data = {
      explanation: `An error occurred during content moderation: ${error.message}`,
      not: parameters.not || false,
      restrictedCategories: parameters.categories || [],
      textExcerpt: text
        ? text.length > 100
          ? text.slice(0, 100) + '...'
          : text
        : 'No text available',
    };
  }

  return { error, verdict, data };
};
