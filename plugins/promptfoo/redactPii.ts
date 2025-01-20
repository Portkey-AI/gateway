import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { postPromptfoo } from './globals';
import { PIIResult } from './types';

export const redactPii = async (text: string) => {
  const piiObject = {
    input: text,
  };

  const result = await postPromptfoo<PIIResult>('pii', piiObject);

  if (result.results[0].flagged) {
    // Sort PII entries in reverse order to avoid offset issues when replacing
    const piiEntries = result.results[0].payload.pii.sort(
      (a, b) => b.start - a.start
    );
    let maskedText = piiObject.input;
    // Replace each PII instance with its masked version
    for (const entry of piiEntries) {
      const maskText = `[${entry.entity_type.toUpperCase()}]`;
      maskedText =
        maskedText.slice(0, entry.start) +
        maskText +
        maskedText.slice(entry.end);
    }

    return maskedText;
  }

  return null;
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
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
      };
    }

    const transformedTextPromise = textArray.map((text) => redactPii(text));

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
