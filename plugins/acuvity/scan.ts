import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getApexUrlFromToken,
  ResponseHelper,
  GuardName,
  GuardResult,
} from './helper';
import { post, getCurrentContentPart, setCurrentContentPart } from '../utils';

interface ScanRequest {
  anonymization: 'FixedSize';
  messages: string[];
  redactions: string[];
  type: 'Input' | 'Output';
}

const getRedactionList = (
  parameters: PluginParameters
): {
  redactions: string[];
  pii_redaction: boolean;
  secret_redaction: boolean;
} => {
  const redactions: string[] = [];
  let pii_redaction: boolean = false;
  let secret_redaction: boolean = false;

  if (parameters.pii && parameters.pii_redact && parameters.pii_categories) {
    for (const category of parameters.pii_categories) {
      redactions.push(category);
    }
    pii_redaction = true;
  }

  if (
    parameters.secrets &&
    parameters.secrets_redact &&
    parameters.secrets_categories
  ) {
    for (const category of parameters.secrets_categories) {
      redactions.push(category);
    }
    secret_redaction = true;
  }

  return { redactions, pii_redaction, secret_redaction };
};

export const postAcuvityScan = async (
  base_url: string,
  apiKey: string,
  textArray: Array<string>,
  eventType: HookEventType,
  redactions: string[]
) => {
  const data: ScanRequest = {
    anonymization: 'FixedSize',
    messages: textArray,
    redactions: redactions,
    type: eventType === 'beforeRequestHook' ? 'Input' : 'Output',
  };

  const options = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  return post(`${base_url}/_acuvity/scan`, data, options);
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  try {
    if (!parameters.credentials) {
      throw new Error('acuvity api key not given');
    }

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    let token = parameters.credentials.apiKey;
    let base_url = getApexUrlFromToken(token);

    if (!base_url) {
      throw new Error('acuvity base url not given');
    }

    let redactResult = getRedactionList(parameters);
    const redactionList = redactResult.redactions;
    const result: any = await postAcuvityScan(
      base_url,
      token,
      textArray,
      eventType,
      redactionList
    );

    const responseHelper = new ResponseHelper();
    const extractionResult = result as { extractions: Array<{ data: string }> };
    const respTextArray = extractionResult.extractions.map(
      (extraction) => extraction.data
    );
    let guardResults = new Set();

    // Loop through all extractions
    for (const extraction of result.extractions) {
      // Evaluate parameters for current extraction
      const currentResults = evaluateAllParameters(
        extraction,
        parameters,
        responseHelper
      );
      // Add all results from current iteration to the main Set
      currentResults.forEach((result) => guardResults.add(result));
    }

    let hasPII = guardResults.has(GuardName.PII_DETECTOR);
    let hasSecret = guardResults.has(GuardName.SECRETS_DETECTOR);

    if (redactionList.length > 0 && (hasPII || hasSecret)) {
      setCurrentContentPart(context, eventType, transformedData, respTextArray);
      transformed = true;
    }

    const scanResult: any = {
      guards: JSON.stringify([...guardResults]),
    };
    data = scanResult;

    // check if only PII/Secrets is enabled with redaction,
    // if yes then return the redacted data with verdict = true.
    // else verdict = false, as we found other detections.
    if (
      guardResults.size == 2 &&
      redactResult.pii_redaction &&
      redactResult.secret_redaction &&
      hasPII &&
      hasSecret
    ) {
      verdict = true;
    } else if (
      guardResults.size == 1 &&
      redactionList.length > 0 &&
      (hasPII || hasSecret)
    ) {
      verdict = true;
    } else if (guardResults.size > 0) {
      // for the other detections.
      verdict = false;
    }
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data, transformedData, transformed };
};

function evaluateAllParameters(
  extraction: any,
  parameters: PluginParameters,
  responseHelper: ResponseHelper
): Set<GuardName> {
  const guardTypes = new Set<GuardName>();

  // Check prompt injection
  if (parameters.prompt_injection) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.PROMPT_INJECTION,
      parameters.prompt_injection_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.PROMPT_INJECTION);
    }
  }

  // Check toxic content
  if (parameters.toxic) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.TOXIC,
      parameters.toxic_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.TOXIC);
    }
  }

  // Check jailbreak
  if (parameters.jail_break) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.JAIL_BREAK,
      parameters.jail_break_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.JAIL_BREAK);
    }
  }

  // Check malicious URL
  if (parameters.malicious_url) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.MALICIOUS_URL,
      parameters.malicious_url_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.MALICIOUS_URL);
    }
  }

  // Check bias
  if (parameters.biased) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.BIASED,
      parameters.biased_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.BIASED);
    }
  }

  // Check harmful content
  if (parameters.harmful) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.HARMFUL_CONTENT,
      parameters.harmful_threshold || 0.0
    );
    if (check.matched) {
      guardTypes.add(GuardName.HARMFUL_CONTENT);
    }
  }

  // Check language
  if (parameters.language && parameters.language_values) {
    const check = responseHelper.evaluate(
      extraction,
      GuardName.LANGUAGE,
      0.5,
      parameters.language_values
    );
    if (check.matched) {
      guardTypes.add(GuardName.LANGUAGE);
    }
  }

  // Check PII
  if (parameters.pii && parameters.pii_categories) {
    for (const category of parameters.pii_categories) {
      const check = responseHelper.evaluate(
        extraction,
        GuardName.PII_DETECTOR,
        0.0,
        category.toLowerCase()
      );
      if (check.matched) {
        guardTypes.add(GuardName.PII_DETECTOR);
        break;
      }
    }
  }

  // Check Secrets
  if (parameters.secrets && parameters.secrets_categories) {
    for (const category of parameters.secrets_categories) {
      const check = responseHelper.evaluate(
        extraction,
        GuardName.SECRETS_DETECTOR,
        0.0,
        category.toLowerCase()
      );
      if (check.matched) {
        guardTypes.add(GuardName.SECRETS_DETECTOR);
        break;
      }
    }
  }

  return guardTypes;
}
