import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { findAllLongestPositions, postPatronus } from './globals';

export function maskEntities(
  text: string,
  positions: [number, number][]
): string {
  if (!text || !positions.length) return text;

  let result = '';
  let lastIndex = 0;

  // Sort positions by start index to handle them in order
  positions.sort((a, b) => a[0] - b[0]);

  for (const [start, end] of positions) {
    // Add text before the masked section
    result += text.slice(lastIndex, start);

    // Get the section to be masked
    const section = text.slice(start, end);
    if (section.length <= 4) {
      // If section is 4 chars or less, mask everything
      result += '*'.repeat(section.length);
    } else {
      // Keep first 2 and last 2 chars, mask the rest
      result +=
        section.slice(0, 1) +
        '*'.repeat(section.length - 2) +
        section.slice(-1);
    }
    lastIndex = end;
  }

  // Add any remaining text after the last masked section
  result += text.slice(lastIndex);

  return result;
}

const redactPii = async (text: string, credentials: any, timeout?: number) => {
  if (!text) return { maskedText: null, data: null };
  const evaluator = 'pii';
  const evaluationBody: any = {
    output: text,
  };

  const result: any = await postPatronus(
    evaluator,
    credentials,
    evaluationBody,
    timeout
  );

  const evalResult = result.results[0];

  const positionsData = evalResult.evaluation_result.additional_info;
  if (
    Array.isArray(positionsData?.positions) &&
    positionsData.positions.length > 0
  ) {
    const longestPosition = findAllLongestPositions(positionsData);
    if (longestPosition?.positions && longestPosition.positions.length > 0) {
      const maskedText = maskEntities(text, longestPosition.positions);
      return { maskedText, data: result.results[0] };
    }
  }
  return { maskedText: null, data: result.results[0] };
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
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

    const results = await Promise.all(
      textArray.map((text) =>
        redactPii(text, parameters.credentials, parameters.timeout)
      )
    );

    const hasPII = results.some(
      (result) => result?.data?.evaluation_result.pass === false
    );

    const piiData =
      results.find((result) => result?.maskedText)?.data ?? results[0]?.data;
    error =
      results.find((result) => result?.data?.error_message)?.data
        ?.error_message || null;

    let shouldBlock = hasPII;
    if (parameters?.redact && hasPII) {
      const maskedTexts = results.map((result) => result?.maskedText ?? null);
      setCurrentContentPart(context, eventType, transformedData, maskedTexts);
      shouldBlock = false;
      transformed = true;
    }

    // verdict can be true/false
    verdict = !shouldBlock;
    data = piiData?.evaluation_result?.additional_info;
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data, transformedData, transformed };
};
