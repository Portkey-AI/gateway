import { generateAWSHeaders } from '../../src/providers/bedrock/utils';
import { PluginHandler } from '../types';
import { getText, HttpError, post } from '../utils';

const REQUIRED_CREDENTIAL_KEYS = [
  'accessKeyId',
  'accessKeySecret',
  'guardrailVersion',
  'guardrailId',
  'region',
];

type BedrockFunction = 'contentFilter' | 'pii' | 'wordFilter';
type BedrockBody = {
  source: 'INPUT' | 'OUTPUT';
  content: { text: { text: string } }[];
};
type PIIType =
  | 'ADDRESS'
  | 'AGE'
  | 'AWS_ACCESS_KEY'
  | 'AWS_SECRET_KEY'
  | 'CA_HEALTH_NUMBER'
  | 'CA_SOCIAL_INSURANCE_NUMBER'
  | 'CREDIT_DEBIT_CARD_CVV'
  | 'CREDIT_DEBIT_CARD_EXPIRY'
  | 'CREDIT_DEBIT_CARD_NUMBER'
  | 'DRIVER_ID'
  | 'EMAIL'
  | 'INTERNATIONAL_BANK_ACCOUNT_NUMBER'
  | 'IP_ADDRESS'
  | 'LICENSE_PLATE'
  | 'MAC_ADDRESS'
  | 'NAME'
  | 'PASSWORD'
  | 'PHONE'
  | 'PIN'
  | 'SWIFT_CODE'
  | 'UK_NATIONAL_HEALTH_SERVICE_NUMBER'
  | 'UK_NATIONAL_INSURANCE_NUMBER'
  | 'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER'
  | 'URL'
  | 'USERNAME'
  | 'US_BANK_ACCOUNT_NUMBER'
  | 'US_BANK_ROUTING_NUMBER'
  | 'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER'
  | 'US_PASSPORT_NUMBER'
  | 'US_SOCIAL_SECURITY_NUMBER'
  | 'VEHICLE_IDENTIFICATION_NUMBER';

interface BedrockAction<T = string> {
  action: 'BLOCKED' | T;
}

interface ContentPolicy extends BedrockAction {
  confidence: 'LOW' | 'NONE' | 'MEDIUM' | 'HIGH';
  type:
    | 'INSULTS'
    | 'HATE'
    | 'SEXUAL'
    | 'VIOLENCE'
    | 'MISCONDUCT'
    | 'PROMPT_ATTACK';
  filterStrength: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface WordPolicy extends BedrockAction {
  match: string;
}

interface PIIFilter extends BedrockAction<'ANONYMIZED'> {
  match: string;
  type: PIIType;
}

interface BedrockResponse {
  action: 'NONE' | 'GUARDRAIL_INTERVENED';
  assessments: {
    wordPolicy: {
      customWords: WordPolicy[];
      managedWordLists: (WordPolicy & { type: 'PROFANITY' })[];
    };
    contentPolicy: { filters: ContentPolicy[] };
    sensitiveInformationPolicy: {
      piiEntities: PIIFilter[];
      regexes: (Omit<PIIFilter, 'type'> & { name: string; regex: string })[];
    };
  }[];
  usage: {
    contentPolicyUnits: number;
    sensitiveInformationPolicyUnits: number;
    wordPolicyUnits: number;
  };
}

export interface BedrockParameters {
  accessKeyId: string;
  accessKeySecret: string;
  guardrailVersion: string;
  guardrailId: string;
  region: string;
  awsSessionToken?: string;
}

enum ResponseKey {
  pii = 'sensitiveInformationPolicy',
  contentFilter = 'contentPolicy',
  wordFilter = 'wordPolicy',
}

export const pluginHandler: PluginHandler<BedrockParameters> = async function (
  this: { fn: BedrockFunction },
  context,
  parameters,
  eventType
) {
  const credentials = parameters.credentials;

  const validate = REQUIRED_CREDENTIAL_KEYS.every((key) =>
    Boolean(credentials?.[key as keyof BedrockParameters])
  );

  let verdict = true;
  let error = null;
  let data = null;

  if (!validate) {
    return {
      verdict,
      error: 'Missing required credentials',
      data,
    };
  }

  const body = {} as BedrockBody;

  if (eventType === 'beforeRequestHook') {
    body.source = 'INPUT';
  } else {
    body.source = 'OUTPUT';
  }

  body.content = [
    {
      text: {
        text: getText(context, eventType),
      },
    },
  ];

  const url = `https://bedrock-runtime.${credentials?.region}.amazonaws.com/guardrail/${credentials?.guardrailId}/version/${credentials?.guardrailVersion}/apply`;

  const headers = await generateAWSHeaders(
    body,
    {
      'Content-Type': 'application/json',
    },
    url,
    'POST',
    'bedrock',
    credentials?.region ?? 'us-east-1',
    credentials?.accessKeyId!,
    credentials?.accessKeySecret!,
    credentials?.awsSessionToken || ''
  );

  try {
    const response = await post<BedrockResponse>(url, body, {
      headers,
      method: 'POST',
    });

    if (response.action === 'GUARDRAIL_INTERVENED') {
      data = response.assessments[0]?.[ResponseKey[this.fn]];

      if (this.fn === 'pii' && response.usage.contentPolicyUnits > 0) {
        verdict = false;
      }
      if (
        this.fn === 'contentFilter' &&
        response.usage.contentPolicyUnits > 0
      ) {
        verdict = false;
      }

      if (this.fn === 'wordFilter' && response.usage.wordPolicyUnits > 0) {
        verdict = false;
      }
    }
  } catch (e) {
    if (e instanceof HttpError) {
      error = e.response.body;
    } else {
      error = (e as Error).message;
    }
  }
  return {
    verdict,
    error,
    data,
  };
};
