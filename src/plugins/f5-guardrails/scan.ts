import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getCurrentContentPart, setCurrentContentPart } from '../utils';

interface F5GuardrailsCredentials {
  projectId: string;
  apiKey: string;
  calypsoUrl?: string;
}

interface F5GuardrailsResponse {
  id: string;
  redactedInput: string;
  result: {
    scannerResults: Array<{
      scannerId: string;
      outcome: 'passed' | 'failed';
      data: unknown;
    }>;
    outcome: 'cleared' | 'flagged' | 'redacted' | 'blocked';
  };
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData: Record<string, unknown> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  const credentials = parameters.credentials as
    | F5GuardrailsCredentials
    | undefined;

  if (!parameters?.projectId || !credentials?.apiKey) {
    return {
      error: new Error(`Missing required credentials`),
      verdict: true,
      data,
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

  const calypsoUrl = credentials?.calypsoUrl || 'https://us1.calypsoai.app';
  const redactEnabled = parameters.redact as boolean | undefined;

  const apiUrl = `${calypsoUrl}/backend/v1/scans`;

  try {
    // Process each content part.
    const results = await Promise.all(
      textArray.map(async (text) => {
        if (!text) return null;

        const requestBody = {
          input: text,
          project: parameters.projectId,
        };

        const requestOptions = {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credentials.apiKey}`,
            'User-Agent': 'portkey-ai-plugin/1.0.0',
          },
        };

        const response = await post<F5GuardrailsResponse>(
          apiUrl,
          requestBody,
          requestOptions,
          parameters.timeout
        );

        return {
          outcome: response.result.outcome,
          redactedInput: response.redactedInput,
          result: response.result,
        };
      })
    );

    // Check if any content part's check is blocked or flagged.
    const shouldBlockRequest = results.some((result) =>
      ['blocked', 'flagged'].includes(result?.outcome ?? '')
    );

    // Block the request if any of the content part is blocked or flagged.
    if (shouldBlockRequest) {
      verdict = false;
    }

    // No content part is blocked, check for redaction if enabled.
    if (!shouldBlockRequest && redactEnabled) {
      const redactedTexts = results.map((result) =>
        result?.outcome === 'redacted' ? result?.redactedInput : null
      );
      const hasRedacted = redactedTexts.some((text) => text !== null);
      setCurrentContentPart(context, eventType, transformedData, redactedTexts);
      if (hasRedacted) {
        transformed = true;
      }
    }
    data = results;
  } catch (e) {
    error = e as Error;
    // On error, default to allowing the request (fail open)
    verdict = true;
    data = null;
  }

  return {
    error,
    verdict,
    data,
    transformedData,
    transformed,
  };
};
