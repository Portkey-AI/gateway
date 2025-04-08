export type BedrockAccessKeyCreds = {
  awsAuthType?: 'accessKey';
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  awsRegion: string;
};

export type BedrockAssumedRoleCreds = {
  awsAuthType: 'assumedRole';
  awsRoleArn: string;
  awsExternalId: string;
  awsRegion: string;
};

export type BedrockBody = {
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

export interface PIIFilter<T = any> extends BedrockAction<T> {
  match: string;
  type: PIIType;
}

export interface BedrockResponse {
  action: 'NONE' | 'GUARDRAIL_INTERVENED';
  assessments: {
    wordPolicy?: {
      customWords: WordPolicy[];
      managedWordLists: (WordPolicy & { type: 'PROFANITY' })[];
    };
    contentPolicy?: { filters: ContentPolicy[] };
    sensitiveInformationPolicy?: {
      piiEntities: PIIFilter<'ANONYMIZED' | 'BLOCKED'>[];
      regexes: (Omit<PIIFilter, 'type'> & {
        name: string;
        regex: string;
      })[];
    };
  }[];
  output: {
    text: string;
  }[];
  usage: {
    contentPolicyUnits: number;
    sensitiveInformationPolicyUnits: number;
    wordPolicyUnits: number;
  };
}

export interface BedrockParameters {
  credentials: BedrockAccessKeyCreds | BedrockAssumedRoleCreds;
  guardrailVersion: string;
  guardrailId: string;
}
