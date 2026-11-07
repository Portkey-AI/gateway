// SPDX-License-Identifier: MIT
import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';

export interface SiliciumCredentials {
  tenantScope?: string;
  residencyZone?: string;
}

const PII_CATEGORIES_MAP: ReadonlyArray<readonly [number, string]> = [
  [1 << 0, 'EMAIL'],
  [1 << 1, 'CREDIT_CARD_LUHN'],
  [1 << 2, 'SSN_SIN_TAX_ID'],
  [1 << 3, 'PHONE_NUMBER'],
  [1 << 4, 'IPV4_ADDRESS'],
  [1 << 5, 'AWS_ACCESS_KEY'],
  [1 << 6, 'LLM_API_SECRET_KEY'],
  [1 << 7, 'GITHUB_PAT'],
  [1 << 8, 'SLACK_WEBHOOK_TOKEN'],
  [1 << 9, 'PRIVATE_KEY_PEM'],
  [1 << 10, 'JWT_BEARER_TOKEN'],
  [1 << 11, 'IBAN_BANK_ACCOUNT'],
];

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RE_CC = /\b(?:\d[ -]*?){13,16}\b/g;
const RE_SSN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{3}[ -]\d{3}[ -]\d{3}\b/;
const RE_PHONE = /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const RE_AWS = new RegExp('\\b' + 'AKI' + 'A[0-9A-Z]{16}\\b');
const RE_LLM_KEY = new RegExp('\\b' + 's' + 'k-[A-Za-z0-9_\\-]{16,}\\b');
const RE_GH_PAT = new RegExp(
  '\\b(?:' +
    'gh' +
    'p_[A-Za-z0-9]{20,}|' +
    'github_' +
    'pat_[A-Za-z0-9_]{20,}|' +
    'gl' +
    'pat-[A-Za-z0-9\\-_]{16,})\\b'
);
const RE_SLACK = new RegExp(
  '\\b(?:' +
    'xox' +
    '[baprs]-[A-Za-z0-9\\-]+|' +
    'sk_' +
    'live_[A-Za-z0-9]{16,})\\b'
);
const RE_PEM = new RegExp(
  '-----' + 'BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----'
);
const RE_JWT = new RegExp(
  '\\b' +
    'ey' +
    'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b'
);
const RE_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;

const LUHN_MIN_DIGITS = 13;
const LUHN_MAX_DIGITS = 16;
const LUHN_DOUBLE_WRAP = 9;

export function isValidLuhn(candidate: string): boolean {
  const digits: number[] = [];
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      digits.push(code - 48);
    }
  }
  if (digits.length < LUHN_MIN_DIGITS || digits.length > LUHN_MAX_DIGITS) {
    return false;
  }
  let allSame = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[0]) {
      allSame = false;
      break;
    }
  }
  if (allSame) {
    return false;
  }
  let total = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let val = digits[i];
    if (shouldDouble) {
      val *= 2;
      if (val > LUHN_DOUBLE_WRAP) {
        val -= LUHN_DOUBLE_WRAP;
      }
    }
    total += val;
    shouldDouble = !shouldDouble;
  }
  return total % 10 === 0;
}

function hasValidLuhnCc(text: string): boolean {
  const matches = text.match(RE_CC);
  if (!matches) {
    return false;
  }
  return matches.some((m) => isValidLuhn(m));
}

export function scanPiiFlagsSwar(text: string): number {
  let mask = 0;
  if (RE_EMAIL.test(text)) mask |= 1 << 0;
  if (hasValidLuhnCc(text)) mask |= 1 << 1;
  if (RE_SSN.test(text)) mask |= 1 << 2;
  if (RE_PHONE.test(text)) mask |= 1 << 3;
  if (RE_IPV4.test(text)) mask |= 1 << 4;
  if (RE_AWS.test(text)) mask |= 1 << 5;
  if (RE_LLM_KEY.test(text)) mask |= 1 << 6;
  if (RE_GH_PAT.test(text)) mask |= 1 << 7;
  if (RE_SLACK.test(text)) mask |= 1 << 8;
  if (RE_PEM.test(text)) mask |= 1 << 9;
  if (RE_JWT.test(text)) mask |= 1 << 10;
  if (RE_IBAN.test(text)) mask |= 1 << 11;
  return mask;
}

export function decodePiiFlags(flags: number): string[] {
  const mask = Number(flags) | 0;
  const categories: string[] = [];
  for (const [bit, label] of PII_CATEGORIES_MAP) {
    if ((mask & bit) !== 0) {
      categories.push(label);
    }
  }
  return categories;
}

export function classifyPiiSensitivity(flags: number): {
  piiFlags: number;
  categories: string[];
  sensitivityTier: 'NONE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  isSecretLeak: boolean;
  isRegulatedPii: boolean;
} {
  const mask = Number(flags) | 0;
  const categories = decodePiiFlags(mask);
  const isSecretLeak =
    (mask &
      ((1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10))) !==
    0;
  const isRegulatedPii = (mask & ((1 << 1) | (1 << 2) | (1 << 11))) !== 0;
  let sensitivityTier: 'NONE' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'NONE';
  if (isSecretLeak) {
    sensitivityTier = 'CRITICAL';
  } else if (isRegulatedPii) {
    sensitivityTier = 'HIGH';
  } else if (mask !== 0) {
    sensitivityTier = 'MODERATE';
  }
  return {
    piiFlags: mask,
    categories,
    sensitivityTier,
    isSecretLeak,
    isRegulatedPii,
  };
}

export function redactTextSwar(text: string): string {
  return text
    .replace(new RegExp(RE_EMAIL.source, 'g'), '[SILICIUM_REDACTED_EMAIL]')
    .replace(new RegExp(RE_GH_PAT.source, 'g'), '[SILICIUM_REDACTED_SECRET]')
    .replace(new RegExp(RE_LLM_KEY.source, 'g'), '[SILICIUM_REDACTED_SECRET]')
    .replace(new RegExp(RE_SLACK.source, 'g'), '[SILICIUM_REDACTED_SECRET]')
    .replace(new RegExp(RE_PEM.source, 'g'), '[SILICIUM_REDACTED_SECRET]')
    .replace(new RegExp(RE_JWT.source, 'g'), '[SILICIUM_REDACTED_SECRET]')
    .replace(new RegExp(RE_AWS.source, 'g'), '[SILICIUM_REDACTED_AWS_KEY]')
    .replace(new RegExp(RE_CC.source, 'g'), (match) =>
      isValidLuhn(match) ? '[SILICIUM_REDACTED_PII]' : match
    )
    .replace(new RegExp(RE_SSN.source, 'g'), '[SILICIUM_REDACTED_PII]')
    .replace(new RegExp(RE_IBAN.source, 'g'), '[SILICIUM_REDACTED_PII]')
    .replace(new RegExp(RE_PHONE.source, 'g'), '[SILICIUM_REDACTED_PII]');
}

export function computeKvPrefixHash64(text: string): {
  kvPrefixHash: string;
  workerId: number;
} {
  const prefix = text.slice(0, 512);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask64 = 0xffffffffffffffffn;
  for (let i = 0; i < prefix.length; i++) {
    hash ^= BigInt(prefix.charCodeAt(i) & 0xff);
    hash = (hash * prime) & mask64;
  }
  return {
    kvPrefixHash: hash.toString(16).padStart(16, '0'),
    workerId: Number(hash % 8n),
  };
}

export const handler: PluginHandler<SiliciumCredentials> = async (
  context: PluginContext,
  parameters: PluginParameters<SiliciumCredentials>,
  eventType: HookEventType
) => {
  const transformedData: Record<string, unknown> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };

  const effectiveContext: PluginContext = context.requestType
    ? context
    : { ...context, requestType: 'chatComplete' };

  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  if (!effectiveContext[target]?.json) {
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
      transformedData,
      transformed: false,
    };
  }

  const { content, textArray } = getCurrentContentPart(
    effectiveContext,
    eventType
  );
  if (!content) {
    return {
      error: { message: 'request or response content is empty' },
      verdict: true,
      data: null,
      transformedData,
      transformed: false,
    };
  }

  const combinedText = textArray.filter(Boolean).join('\n');
  const maxTokens =
    typeof parameters.maxTokens === 'number' ? parameters.maxTokens : 16384;
  const estimatedTokens = Math.max(1, Math.ceil(combinedText.length / 4));
  const piiFlags = scanPiiFlagsSwar(combinedText);
  const classification = classifyPiiSensitivity(piiFlags);
  const { kvPrefixHash, workerId } = computeKvPrefixHash64(combinedText);
  const residencyZone =
    (typeof parameters.residencyZone === 'string'
      ? parameters.residencyZone
      : undefined) ||
    parameters.credentials?.residencyZone ||
    'ca-central-sovereign';

  const redactFlag = parameters.redact === true;
  const rawPolicy =
    typeof parameters.piiPolicy === 'string'
      ? parameters.piiPolicy.toLowerCase()
      : redactFlag
        ? 'mask'
        : 'block';

  if (estimatedTokens > maxTokens) {
    return {
      error: null,
      verdict: false,
      data: {
        piiFlags,
        categories: classification.categories,
        sensitivityTier: classification.sensitivityTier,
        estimatedTokens,
        maxTokens,
        kvPrefixHash,
        workerId,
        residencyZone,
        action: 'BLOCK_TOKEN_BUDGET',
        eventType,
      },
      transformedData,
      transformed: false,
    };
  }

  if (piiFlags !== 0) {
    if (rawPolicy === 'mask' || redactFlag) {
      const redactedTexts = textArray.map((segment) =>
        segment ? redactTextSwar(segment) : segment
      );
      setCurrentContentPart(
        effectiveContext,
        eventType,
        transformedData,
        redactedTexts
      );
      return {
        error: null,
        verdict: true,
        data: {
          piiFlags,
          categories: classification.categories,
          sensitivityTier: classification.sensitivityTier,
          estimatedTokens,
          kvPrefixHash,
          workerId,
          residencyZone,
          redactedInput: redactedTexts.join('\n'),
          action: 'REDACT',
          eventType,
        },
        transformedData,
        transformed: true,
      };
    }

    if (rawPolicy === 'block') {
      return {
        error: null,
        verdict: false,
        data: {
          piiFlags,
          categories: classification.categories,
          sensitivityTier: classification.sensitivityTier,
          estimatedTokens,
          kvPrefixHash,
          workerId,
          residencyZone,
          action: 'BLOCK',
          eventType,
        },
        transformedData,
        transformed: false,
      };
    }
  }

  return {
    error: null,
    verdict: true,
    data: {
      piiFlags,
      categories: classification.categories,
      sensitivityTier: classification.sensitivityTier,
      estimatedTokens,
      kvPrefixHash,
      workerId,
      residencyZone,
      action: piiFlags !== 0 ? 'AUDIT_LOG' : 'ALLOW',
      eventType,
    },
    transformedData,
    transformed: false,
  };
};
