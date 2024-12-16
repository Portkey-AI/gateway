import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText } from '../utils';
import { VERSION } from './version';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;
  try {
    if (!parameters.credentials?.domain) {
      return {
        error: `'parameters.credentials.domain' must be set`,
        verdict: true,
        data,
      };
    }

    if (!parameters.credentials?.apiKey) {
      return {
        error: `'parameters.credentials.apiKey' must be set`,
        verdict: true,
        data,
      };
    }

    // TODO: Update to v1 once released
    const url = `https://ai-guard.${parameters.credentials.domain}/v1beta/text/guard`;

    const text = getText(context, eventType);
    if (!text) {
      return {
        error: 'request or response text is empty',
        verdict: true,
        data,
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
      text: text,
      recipe: parameters.recipe,
      debug: parameters.debug,
      overrides: parameters.overrides,
    };

    const response = await post(url, request, requestOptions);
    data = response.result;
    const si = response.result.findings;
    if (
      !(si.prompt_injection_count || si.malicious_count || si.artifact_count)
    ) {
      verdict = true;
    }
  } catch (e) {
    error = e as Error;
  }

  return {
    error, // or error object if an error occurred
    verdict, // or false to indicate if the guardrail passed or failed
    data, // any additional data you want to return
  };
};
