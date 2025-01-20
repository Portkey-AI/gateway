import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { detectPII } from './pii';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options
) => {
  let transformedData: Record<string, any> = {
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

    let mappedResult = await detectPII(
      textArray,
      parameters.credentials,
      options?.env || {}
    );
    const { detectedPIICategories, PIIData } = mappedResult[0] || {};

    const mappedTextArray = mappedResult.map((result) => {
      if (result.detectedPIICategories.length > 0 && result.redactedText) {
        return result.redactedText;
      }
      return null;
    });

    setCurrentContentPart(
      context,
      eventType,
      transformedData,
      null,
      mappedTextArray
    );
    return {
      error: null,
      verdict: true,
      data: {
        detectedPII: PIIData,
        detectedCategories: detectedPIICategories,
      },
      transformedData,
    };
  } catch (error: any) {
    return {
      error: error as Error,
      verdict: true,
      data: null,
      transformedData,
    };
  }
};
