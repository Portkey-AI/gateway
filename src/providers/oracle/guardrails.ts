import { ORACLE } from '../../globals';
import { Params } from '../../types/requestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

/**
 * Oracle GenAI Guardrails - Content Moderation, PII Detection, Prompt Injection
 *
 * Maps OpenAI /v1/moderations format to OCI GenAI /actions/applyGuardrails
 *
 * Supported guardrail types:
 * - Content Moderation: HATE, VIOLENCE, SEXUAL, HARASSMENT, SELF_HARM
 * - PII Detection: EMAIL, PHONE, SSN, CREDIT_CARD, etc.
 * - Prompt Injection: Detects jailbreak attempts
 */

export interface OracleGuardrailsRequest {
  compartmentId: string;
  input: {
    type: 'TEXT';
    content: string;
    languageCode?: string;
  };
  guardrailConfigs?: {
    contentModerationConfig?: {
      categories?: string[];
    };
    personallyIdentifiableInformationConfig?: {
      types?: string[];
    };
    promptInjectionConfig?: Record<string, never>;
  };
}

export interface OracleGuardrailsResponse {
  results: {
    contentModeration?: {
      categories: Array<{
        name: string;
        score: number;
      }>;
    };
    personallyIdentifiableInformation?: Array<{
      label: string;
      text: string;
      offset: number;
      length: number;
      score: number;
    }>;
    promptInjection?: {
      score: number;
    };
  };
}

export interface OracleGuardrailsErrorResponse {
  code: number;
  message: string;
}

/**
 * Default PII types to detect
 */
const DEFAULT_PII_TYPES = [
  'EMAIL',
  'PHONE_NUMBER',
  'US_SOCIAL_SECURITY_NUMBER',
  'CREDIT_DEBIT_NUMBER',
  'IP_ADDRESS',
  'PERSON',
  'ADDRESS',
];

/**
 * Default content moderation categories
 */
const DEFAULT_MODERATION_CATEGORIES = [
  'HATE',
  'VIOLENCE',
  'SEXUAL',
  'HARASSMENT',
  'SELF_HARM',
];

/**
 * Transform OpenAI moderation request to Oracle guardrails format
 */
export const OracleGuardrailsConfig: ProviderConfig = {
  input: {
    param: 'input',
    required: true,
    transform: (params: Params) => {
      // OpenAI sends input as string or array of strings
      const input = (params as any).input;
      const text = Array.isArray(input) ? input.join('\n') : input;
      return {
        type: 'TEXT',
        content: text,
      };
    },
  },
  model: [
    {
      param: 'compartmentId',
      required: true,
      transform: (_: Params, providerOptions: any) => {
        return providerOptions.oracleCompartmentId;
      },
    },
    {
      param: 'guardrailConfigs',
      required: false,
      transform: (params: Params) => {
        // Check if specific guardrail types are requested
        const guardrailTypes = (params as any).guardrail_types || [
          'content_moderation',
          'pii',
          'prompt_injection',
        ];

        const configs: any = {};

        if (guardrailTypes.includes('content_moderation')) {
          configs.contentModerationConfig = {
            categories:
              (params as any).moderation_categories ||
              DEFAULT_MODERATION_CATEGORIES,
          };
        }

        if (guardrailTypes.includes('pii')) {
          configs.personallyIdentifiableInformationConfig = {
            types: (params as any).pii_types || DEFAULT_PII_TYPES,
          };
        }

        if (guardrailTypes.includes('prompt_injection')) {
          configs.promptInjectionConfig = {};
        }

        return Object.keys(configs).length > 0 ? configs : undefined;
      },
    },
  ],
};

/**
 * Transform Oracle guardrails response to OpenAI moderation format
 */
export const OracleGuardrailsResponseTransform: (
  response: OracleGuardrailsResponse | OracleGuardrailsErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers
) => any | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'code' in response) {
    return generateErrorResponse(
      {
        message: response.message || 'Unknown error',
        type: response.code?.toString() || null,
        param: null,
        code: response.code?.toString() || null,
      },
      ORACLE
    );
  }

  if ('results' in response) {
    const results = response.results;

    // Calculate overall flagged status based on scores
    const contentModeration = results.contentModeration;
    const piiDetection = results.personallyIdentifiableInformation;
    const promptInjection = results.promptInjection;

    // Content is flagged if any moderation score > 0.5 or prompt injection detected
    const overallCategory = contentModeration?.categories?.find(
      (c) => c.name === 'OVERALL'
    );
    const overallScore =
      overallCategory?.score !== undefined ? overallCategory.score : 0;
    const promptInjectionScore =
      promptInjection?.score !== undefined ? promptInjection.score : 0;
    const hasPII = Array.isArray(piiDetection) && piiDetection.length > 0;

    const flagged: boolean =
      overallScore > 0.5 || promptInjectionScore > 0.5 || hasPII;

    // Build category scores in OpenAI format
    const categoryScores: Record<string, number> = {};
    const categories: Record<string, boolean> = {};

    if (contentModeration?.categories) {
      for (const cat of contentModeration.categories) {
        const normalizedName = cat.name.toLowerCase().replace(/_/g, '-');
        if (normalizedName !== 'overall' && normalizedName !== 'blocklist') {
          categoryScores[normalizedName] = cat.score;
          categories[normalizedName] = cat.score > 0.5;
        }
      }
    }

    // Add prompt injection as a category
    if (promptInjection) {
      categoryScores['prompt-injection'] = promptInjection.score;
      categories['prompt-injection'] = promptInjection.score > 0.5;
    }

    // Add PII detection info
    if (hasPII) {
      categoryScores['pii-detected'] = 1.0;
      categories['pii-detected'] = true;
    }

    return {
      id: `modr-${Date.now()}`,
      model: 'oracle-guardrails',
      results: [
        {
          flagged,
          categories,
          category_scores: categoryScores,
          // Include Oracle-specific detailed results
          oracle_details: {
            content_moderation: contentModeration,
            pii_detection: piiDetection,
            prompt_injection: promptInjection,
          },
        },
      ],
    };
  }

  return generateInvalidProviderResponseError(response, ORACLE);
};

/**
 * Get the Oracle guardrails endpoint
 */
export const getOracleGuardrailsEndpoint = (
  oracleApiVersion: string = '20231130'
): string => {
  return `/${oracleApiVersion}/actions/applyGuardrails`;
};
