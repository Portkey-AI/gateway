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

const redactPii = async (text: string, credentials: any) => {
  const evaluator = 'pii';
  const evaluationBody: any = {
    output: text,
  };

  const result: any = await postPatronus(
    evaluator,
    credentials,
    evaluationBody
  );

  const evalResult = result.results[0];

  const positionsData = evalResult.evaluation_result.additional_info;
  if (
    positionsData &&
    positionsData.positions &&
    positionsData.positions.length > 0
  ) {
    const longestPosition = findAllLongestPositions(positionsData);
    if (longestPosition?.positions && longestPosition.positions.length > 0) {
      const maskedText = maskEntities(text, longestPosition.positions);
      return maskedText;
    }
  }
  return null;
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };

  try {
    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
      };
    }

    const transformedTextPromise = textArray.map((text) =>
      redactPii(text, parameters.credentials)
    );

    const transformedText = await Promise.all(transformedTextPromise);

    setCurrentContentPart(
      context,
      eventType,
      transformedData,
      null,
      transformedText
    );

    return {
      error: null,
      verdict: true,
      data:
        transformedText.filter((text) => text !== null).length > 0
          ? { flagged: true }
          : null,
      transformedData,
    };
  } catch (e: any) {
    delete e.stack;
    return {
      error: e as Error,
      verdict: true,
      data: null,
      transformedData,
    };
  }
};
