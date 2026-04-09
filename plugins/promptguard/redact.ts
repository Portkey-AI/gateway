import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getCurrentContentPart,
  post,
  setCurrentContentPart,
  HttpError,
} from '../utils';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;
  const shouldRedact = parameters.redact !== false;

  try {
    if (context.requestType === 'embed' && shouldRedact) {
      return {
        error: { message: 'PII redaction is not supported for embed requests' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    if (!parameters.credentials?.apiKey) {
      return {
        error: `'parameters.credentials.apiKey' must be set`,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const baseUrl =
      parameters.credentials.baseUrl || 'https://api.promptguard.co/api/v1';
    const url = `${baseUrl}/security/redact`;

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

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': parameters.credentials.apiKey,
      },
    };

    const redactedTextArray: (string | null)[] = [];
    let piiDetected = false;
    const allPiiFound: string[] = [];

    for (const text of textArray) {
      if (!text) {
        redactedTextArray.push(null);
        continue;
      }

      const request: Record<string, any> = { content: text };
      if (parameters.piiTypes?.length) {
        request.pii_types = parameters.piiTypes;
      }

      const response = await post(
        url,
        request,
        requestOptions,
        parameters.timeout
      );

      if (response.piiFound?.length > 0) {
        piiDetected = true;
        allPiiFound.push(...response.piiFound);
      }

      redactedTextArray.push(response.redacted || text);
    }

    let shouldBlock = piiDetected;
    if (piiDetected && shouldRedact) {
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        redactedTextArray
      );
      shouldBlock = false;
      transformed = true;
    }

    return {
      error: null,
      verdict: !shouldBlock,
      data: {
        piiDetected,
        piiTypes: [...new Set(allPiiFound)],
      },
      transformedData,
      transformed,
    };
  } catch (e) {
    if (e instanceof HttpError) {
      return {
        error: `${e.message}. body: ${e.response.body}`,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }
    return {
      error: e as Error,
      verdict: true,
      data: null,
      transformedData,
      transformed,
    };
  }
};
