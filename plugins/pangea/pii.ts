import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, post, setCurrentContentPart } from '../utils';
import { VERSION } from './version';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let transformedData = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  const redact = parameters.redact || false;

  try {
    if (context.requestType === 'embed' && parameters?.redact) {
      return {
        error: { message: 'PII redaction is not supported for embed requests' },
        verdict: true,
        data: null,
        transformedData,
      };
    }

    if (!parameters.credentials?.domain) {
      return {
        error: `'parameters.credentials.domain' must be set`,
        verdict: true,
        data: null,
      };
    }

    if (!parameters.credentials?.apiKey) {
      return {
        error: `'parameters.credentials.apiKey' must be set`,
        verdict: true,
        data: null,
      };
    }

    const url = `https://redact.${parameters.credentials.domain}/v1/redact_structured`;

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
      };
    }

    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'portkey-ai-plugin/' + VERSION,
        Authorization: `Bearer ${parameters.credentials.apiKey}`,
      },
    };
    const request = {
      data: textArray,
    };

    const response = await post(url, request, requestOptions);
    const piiDetected =
      response.result?.count > 0 && response.result.redacted_data
        ? true
        : false;

    let shouldBlock = piiDetected;
    if (piiDetected && redact) {
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        response.result.redacted_data
      );
      shouldBlock = false;
    }

    return {
      error: null,
      verdict: !shouldBlock,
      data: {
        summary: response.summary,
      },
      transformedData,
    };
  } catch (e) {
    return {
      error: e as Error,
      verdict: true,
      data: null,
      transformedData,
    };
  }
};
