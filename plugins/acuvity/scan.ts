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
import { getText, post } from '../utils';

export const postAcuvityScan = async (
  base_url: string,
  credentials: any,
  data: any
) => {
  const options = {
    headers: {
      Authorization: 'Bearer ' + credentials.apiKey,
    },
  };
  return post(base_url, data, options);
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  if (!parameters.credentials) {
    throw new Error('acuvity api key not given');
  }

  const text = getText(context, eventType);

  let token = parameters.credentials.apiKey;
  let base_url = getApexUrlFromToken(token);

  if (!base_url) {
    throw new Error('acuvity base url not given');
  }

  const result: any = await postAcuvityScan(
    base_url,
    parameters.credentials,
    text
  );

  const responseHelper = new ResponseHelper();

  // Loop through all extractions
  for (const extraction of result.extractions) {
    // Evaluate parameters for current extraction
    const results = evaluateAllParameters(
      extraction,
      parameters,
      responseHelper
    );

    // Check if any parameter check failed in this extraction
    for (const { result } of results) {
      if (result.matched) {
        verdict = true;
        break;
      }
    }

    // Optionally, break the outer loop if we already found a match
    if (verdict) {
      break;
    }
  }

  return { error, verdict, data };
};

function evaluateAllParameters(
  extraction: any,
  parameters: PluginParameters,
  responseHelper: ResponseHelper
): Array<{ parameter: string; result: GuardResult }> {
  const results: Array<{ parameter: string; result: GuardResult }> = [];

  // Check prompt injection
  if (parameters.prompt_injection.enabled) {
    results.push({
      parameter: 'prompt_injection',
      result: responseHelper.evaluate(
        extraction,
        GuardName.PROMPT_INJECTION,
        parameters.prompt_injection.threshold || 0.5
      ),
    });
  }

  // Check toxic content
  if (parameters.toxic.enabled) {
    results.push({
      parameter: 'toxic',
      result: responseHelper.evaluate(
        extraction,
        GuardName.TOXIC,
        parameters.toxic.threshold || 0.5
      ),
    });
  }

  // Check jailbreak
  if (parameters.jail_break.enabled) {
    results.push({
      parameter: 'jail_break',
      result: responseHelper.evaluate(
        extraction,
        GuardName.JAIL_BREAK,
        parameters.jail_break.threshold || 0.5
      ),
    });
  }

  // Check malicious URL
  if (parameters.malicious_url.enabled) {
    results.push({
      parameter: 'malicious_url',
      result: responseHelper.evaluate(
        extraction,
        GuardName.MALICIOUS_URL,
        parameters.malicious_url.threshold || 0.5
      ),
    });
  }

  // Check bias
  if (parameters.biased.enabled) {
    results.push({
      parameter: 'biased',
      result: responseHelper.evaluate(
        extraction,
        GuardName.BIASED,
        parameters.biased.threshold || 0.5
      ),
    });
  }

  // Check harmful content
  if (parameters.harmful.enabled) {
    results.push({
      parameter: 'harmful',
      result: responseHelper.evaluate(
        extraction,
        GuardName.HARMFUL_CONTENT,
        parameters.harmful.threshold || 0.5
      ),
    });
  }

  // Check language
  if (parameters.language.enabled && parameters.language.languagevals) {
    results.push({
      parameter: 'language',
      result: responseHelper.evaluate(
        extraction,
        GuardName.LANGUAGE,
        0.5, // Language check typically uses a fixed threshold
        parameters.language.languagevals
      ),
    });
  }

  // Check PII
  if (parameters.pii.enabled && parameters.pii.categories) {
    // Iterate through each PII category
    for (const category of parameters.pii.categories) {
      results.push({
        parameter: `pii_${category.toLowerCase()}`,
        result: responseHelper.evaluate(
          extraction,
          GuardName.PII_DETECTOR,
          0.5, // PII typically uses a fixed threshold
          category.toLowerCase()
        ),
      });
    }
  }

  // Check Secrets
  if (parameters.secrets.enabled && parameters.secrets.categories) {
    // Iterate through each secrets category
    for (const category of parameters.secrets.categories) {
      results.push({
        parameter: `secrets_${category.toLowerCase()}`,
        result: responseHelper.evaluate(
          extraction,
          GuardName.SECRETS_DETECTOR,
          0.5, // PII typically uses a fixed threshold
          category.toLowerCase()
        ),
      });
    }
  }

  return results;
}
