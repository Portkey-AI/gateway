import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { postPromptfoo } from './globals';
import { PIIEntity, PIIResult } from './types';

const maskPiiEntries = (text: string, piiEntries: PIIEntity[]): string => {
  return piiEntries.reduce((maskedText, entry) => {
    const maskText = `[${entry.entity_type.toUpperCase()}]`;
    return (
      maskedText.slice(0, entry.start + 1) +
      maskText +
      maskedText.slice(entry.end)
    );
  }, text);
};

export const redactPii = async (text: string, timeout?: number) => {
  if (!text) {
    return { maskedText: null, data: null };
  }
  const piiObject = {
    input: text,
  };

  const result = await postPromptfoo<PIIResult>('pii', piiObject, timeout);
  const piiResult = result.results[0];

  if (piiResult.flagged) {
    // Sort PII entries in reverse order to avoid offset issues when replacing
    const sortedPiiEntries = piiResult.payload.pii.sort(
      (a, b) => b.start - a.start
    );
    const maskedText = maskPiiEntries(text, sortedPiiEntries);

    return { maskedText, data: result.results[0] };
  }

  return { maskedText: null, data: result.results[0] };
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
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

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const redact = parameters.redact || false;
    const results = await Promise.all(
      textArray.map((text) => redactPii(text, parameters.timeout))
    );

    const hasPII = results.some((result) => result?.data?.flagged);
    let shouldBlock = hasPII;

    const piiData =
      results.find((result) => result?.maskedText)?.data ?? results[0]?.data;

    if (hasPII && redact) {
      const maskedTexts = results.map((result) => result?.maskedText ?? null);
      setCurrentContentPart(context, eventType, transformedData, maskedTexts);
      shouldBlock = false;
      transformed = true;
    }

    verdict = !shouldBlock;
    data = piiData;
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data, transformedData, transformed };
};
