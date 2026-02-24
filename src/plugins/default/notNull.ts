import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const not = parameters.not || false;
    const { content, textArray } = getCurrentContentPart(context, eventType);

    // Check if content is null, undefined, or empty
    const isNull =
      content === null ||
      content === undefined ||
      (typeof content === 'string' && content.trim() === '') ||
      (Array.isArray(content) && content.length === 0) ||
      textArray.every((text) => !text || text.trim() === '');

    // By default, verdict is true if content is NOT null (i.e., content exists)
    verdict = not ? isNull : !isNull;

    data = {
      isNull,
      contentType: content === null ? 'null' : typeof content,
      textArrayLength: textArray.length,
      explanation: isNull
        ? 'Content is null, undefined, or empty.'
        : 'Content exists and is not null.',
      verdict: verdict ? 'passed' : 'failed',
    };
  } catch (e: any) {
    error = e;
    data = {
      explanation: 'An error occurred while checking for null content.',
      error: e.message,
    };
  }

  return { error, verdict, data };
};
