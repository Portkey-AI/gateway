import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { findAllLongestPositions, postPatronus } from './globals';
import { maskEntities } from './redactPii';

const redactPhi = async (text: string, credentials: any) => {
  const evaluator = 'phi';

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
    Array.isArray(positionsData?.positions) &&
    positionsData.positions.length > 0
  ) {
    const longestPosition = findAllLongestPositions(positionsData);
    if (longestPosition?.positions && longestPosition.positions.length > 0) {
      const maskedText = maskEntities(text, longestPosition.positions);
      return maskedText;
    }
  }
  return text;
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
      redactPhi(text, parameters.credentials)
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
      data: null,
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
