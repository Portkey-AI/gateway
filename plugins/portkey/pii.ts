import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getCurrentContentPart,
  getText,
  setCurrentContentPart,
} from '../utils';
import {
  PIIResponse,
  PIIResult,
  PORTKEY_ENDPOINTS,
  fetchPortkey,
} from './globals';

export async function detectPII(
  textArray: Array<string> | string,
  parameters: any,
  env: Record<string, any>
): Promise<Promise<PIIResult[]>> {
  const result: PIIResponse[] = await fetchPortkey(
    env,
    PORTKEY_ENDPOINTS.PII,
    parameters.credentials,
    {
      input: textArray,
      ...(parameters.categories && { categories: parameters.categories }),
    },
    parameters.timeout
  );

  return result.map((item) => ({
    detectedPIICategories: [
      ...new Set(item.entities.flatMap((entity) => Object.keys(entity.labels))),
    ],
    PIIData: item.entities.map((entity) => ({
      text: entity.text,
      labels: entity.labels,
    })),
    redactedText: item.processed_text,
  }));
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options
) => {
  let error = null;
  let verdict = false;
  let data: any = null;
  let transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;
  try {
    if (context.requestType === 'embed' && parameters?.redact) {
      return {
        error: { message: 'PII redaction is not supported for embed requests' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const { content, textArray } = getCurrentContentPart(context, eventType);
    const textExcerpt = textArray.filter((text) => text).join('\n');

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    if (!parameters.categories?.length) {
      return {
        error: { message: 'No PII categories are configured' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    if (!parameters.credentials) {
      return {
        error: { message: 'Credentials not found' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    let mappedResult = await detectPII(
      textArray,
      parameters,
      options?.env || {}
    );

    const categoriesToCheck = parameters.categories || [];
    const not = parameters.not || false;

    let detectedCategories: any = new Set();
    const mappedTextArray: Array<string | null> = [];
    mappedResult.forEach((result) => {
      if (result.detectedPIICategories.length > 0 && result.redactedText) {
        result.detectedPIICategories.forEach((category) =>
          detectedCategories.add(category)
        );
        mappedTextArray.push(result.redactedText);
      } else {
        mappedTextArray.push(null);
      }
    });

    detectedCategories = [...detectedCategories];
    let filteredCategories = detectedCategories.filter((category: string) =>
      categoriesToCheck.includes(category)
    );

    const hasPII = filteredCategories.length > 0;
    let shouldBlock = hasPII;
    if (parameters.redact && hasPII) {
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        mappedTextArray
      );
      shouldBlock = false;
      transformed = true;
    }

    verdict = not ? hasPII : !shouldBlock;
    data = {
      verdict,
      not,
      explanation: transformed
        ? `Found and redacted PII in the text: ${filteredCategories.join(', ')}`
        : verdict
          ? not
            ? 'PII was found in the text as expected.'
            : 'No restricted PII was found in the text.'
          : not
            ? 'No PII was found in the text when it should have been.'
            : `Found restricted PII in the text: ${filteredCategories.join(', ')}`,
      // detectedPII: PIIData,
      restrictedCategories: categoriesToCheck,
      detectedCategories: detectedCategories,
      textExcerpt:
        textExcerpt.length > 100
          ? textExcerpt.slice(0, 100) + '...'
          : textExcerpt,
    };
  } catch (e) {
    error = e as Error;
    const text = getText(context, eventType);
    data = {
      explanation: `An error occurred while checking for PII: ${error.message}`,
      not: parameters.not || false,
      restrictedCategories: parameters.categories || [],
      textExcerpt: text
        ? text.length > 100
          ? text.slice(0, 100) + '...'
          : text
        : 'No text available',
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
