import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText, HttpError } from '../utils';
import { VERSION } from './version';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options?: {
    env: Record<string, any>;
    getFromCacheByKey?: (key: string) => Promise<any>;
    putInCacheWithValue?: (key: string, value: any) => Promise<any>;
  }
) => {
  let error = null;
  let verdict = true;
  let data = null;

  // Validate required parameters
  if (!parameters.credentials?.v1Url) {
    return {
      error: { message: `'parameters.credentials.v1Url' must be set` },
      verdict: true,
      data,
    };
  }

  if (!parameters.credentials?.apiKey) {
    return {
      error: { message: `'parameters.credentials.apiKey' must be set` },
      verdict: true,
      data,
    };
  }

  // Extract text from context
  const text = getText(context, eventType);
  if (!text) {
    return {
      error: { message: 'request or response text is empty' },
      verdict: true,
      data,
    };
  }
  const applicationName = parameters.applicationName;

  // Validate application name is provided and has correct format
  if (!applicationName) {
    return {
      error: { message: 'Application name is required' },
      verdict: true,
      data,
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(applicationName)) {
    return {
      error: {
        message:
          'Application name must contain only letters, numbers, hyphens, and underscores',
      },
      verdict: true,
      data,
    };
  }

  // Prepare request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${parameters.credentials?.apiKey}`,
    'TMV1-Application-Name': applicationName,
  };

  // Set Prefer header
  const preferValue = parameters.prefer || 'return=minimal';
  headers['Prefer'] = preferValue;

  const requestOptions = { headers };

  // Prepare request payload for applyGuardrails endpoint
  const request = {
    prompt: text,
  };

  let response;
  try {
    response = await post(
      parameters.credentials?.v1Url,
      request,
      requestOptions,
      parameters.timeout
    );
  } catch (e) {
    if (e instanceof HttpError) {
      error = {
        message: `API request failed: ${e.message}. body: ${e.response.body}`,
      };
    } else {
      error = e as Error;
    }
  }

  if (response) {
    data = response;

    if (response.action && response.action === 'Block') {
      verdict = false;
    }
  }

  return {
    error,
    verdict,
    data,
  };
};
