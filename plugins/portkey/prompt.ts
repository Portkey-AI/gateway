import { getRuntimeKey } from 'hono/adapter';
import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, postWithCloudflareServiceBinding } from '../utils';

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
            completionText: this.completionText,
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
  env: Record<string, any>,
  promptId: string,
  variables: Record<string, string>,
  credentials: Record<string, string>
) => {
  const timeout = 10000;
  const url = `${env.GATEWAY_BASEPATH}/prompts/${promptId}/completions`;
  const postData = { variables };

  let clientAuth;
  if (env.CLIENT_ID) {
    clientAuth = 'clientId::' + env.CLIENT_ID;
  } else if (env.PORTKEY_CLIENT_AUTH) {
    clientAuth = 'clientAuth::' + env.PORTKEY_CLIENT_AUTH;
  } else {
    clientAuth = 'test::test-1234';
  }

  const options = {
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
      'x-portkey-config': JSON.stringify({ retry: { attempts: 1 } }),
      'x-portkey-force-config-override': 'true',
      'x-portkey-client-auth': clientAuth,
    },
  };
  try {
    let responseData;
    if (getRuntimeKey() === 'workerd' && env.authWorker) {
      responseData = await postWithCloudflareServiceBinding(
        url,
        postData,
        env.authWorker,
        options,
        timeout
      );
    } else {
      responseData = await post(url, postData, options, timeout);
    }
    return responseData;
  } catch (e: any) {
    throw e;
  }
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options: any
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
    const responseJson: any = await getPromptCompletion(
      options.env,
      parameters.promptId,
      variables,
      parameters.credentials || {}
    );

    const result = new VerdictChecker(
      responseJson.choices[0].message.content,
      parameters.expectedResult,
      parameters.verdictType
    ).check();

    verdict = result.verdict;
    data = result.data;
  } catch (e) {
    error = e;
  }

  return { error, verdict, data };
};
