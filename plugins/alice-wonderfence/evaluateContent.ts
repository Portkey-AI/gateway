import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, setCurrentContentPart } from '../utils';
import { WonderFenceClient, Actions } from '@alice-io/wonderfence-ts-sdk';
import type {
  AnalysisContext,
  CustomField,
} from '@alice-io/wonderfence-ts-sdk';
import { WonderfenceCredentials } from './globals';

const LOG_PREFIX = '[alice-wonderfence]';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  _options?: Record<string, any>
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  try {
    const client = new WonderFenceClient(
      parameters.credentials as WonderfenceCredentials | undefined
    );

    const text = getText(context, eventType);

    if (!text) {
      error = { message: 'request or response content is empty' };
      return { error, verdict, data, transformedData, transformed };
    }

    const traceId = context.request?.headers?.['x-portkey-trace-id'];

    const analysisContext: AnalysisContext = {
      sessionId:
        context.metadata?.session_id ||
        context.metadata?.sessionId ||
        context.metadata?.sessionID ||
        traceId,
      userId:
        context.metadata?.user_id ||
        context.metadata?._user ||
        context.metadata?.user,
      provider: context.provider,
      modelName: context.request?.json?.model,
    };

    let customFields: CustomField[] | undefined;
    if (typeof parameters.customFields === 'string') {
      customFields = JSON.parse(parameters.customFields);
    } else {
      customFields = parameters.customFields;
    }

    const result =
      eventType === 'beforeRequestHook'
        ? await client.evaluatePrompt(
            analysisContext,
            text,
            undefined,
            customFields
          )
        : await client.evaluateResponse(
            analysisContext,
            text,
            undefined,
            customFields
          );

    const textExcerpt = text.substring(0, 100);

    data = {
      action: result.action,
      correlationId: result.correlationId,
      detections: result.detections,
      ...(parameters.debug === true && { textExcerpt }),
    };

    if (result.action === Actions.BLOCK) {
      console.log(
        LOG_PREFIX,
        'BLOCKING request, correlationId:',
        result.correlationId,
        'detections:',
        JSON.stringify(result.detections)
      );
      verdict = false;
    } else if (result.action === Actions.MASK && result.actionText) {
      console.log(
        LOG_PREFIX,
        'MASKING content, correlationId:',
        result.correlationId,
        'detections:',
        JSON.stringify(result.detections),
        ...(parameters.debug === true
          ? [
              'text excerpt:',
              textExcerpt,
              'masked excerpt:',
              result.actionText.substring(0, 100),
            ]
          : [])
      );
      setCurrentContentPart(context, eventType, transformedData, [
        result.actionText,
      ]);
      transformed = true;
    }
  } catch (e: any) {
    error = { message: e.message, name: e.name };
    const failOpen = parameters.failOpen !== false;
    verdict = failOpen;
    console.error(LOG_PREFIX, 'ERROR:', e.message || e);
  }

  return { error, verdict, data, transformedData, transformed };
};
