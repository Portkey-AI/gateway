import {
  HookEventType,
  PluginContext,
  type PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText } from '../utils';

const ZSCALER_EXECUTE_POLICY_URL =
  'https://api.zseclipse.net/v1/detection/execute-policy';

interface ZscalerCredentials {
  zscalerApiKey: string;
}

interface ZscalerPluginParameters {
  policyId: string;
}

interface ZscalerExecutePolicyRequest {
  policyId: string;
  direction: 'IN' | 'OUT';
  content: any;
}

interface ZscalerExecutePolicyResponse {
  action: 'ALLOW' | 'BLOCK';
  detectorResponses?: Record<string, any>;
}

export const handler: PluginHandler<ZscalerCredentials> = async (
  context: PluginContext,
  parameters: PluginParameters<ZscalerCredentials>,
  eventType: HookEventType
) => {
  let error: Error | null = null;
  let verdict: boolean = true;
  let data: Record<string, any> = {};

  const credentials = parameters.credentials as ZscalerCredentials | undefined;
  const pluginParams = parameters.parameters as ZscalerPluginParameters;

  if (!credentials?.zscalerApiKey) {
    error = new Error('Zscaler AI Guard API Key must be configured.');
    verdict = false;
    return { error, verdict, data };
  }
  if (!pluginParams.policyId) {
    error = new Error('Zscaler AI Guard Policy ID must be configured.');
    verdict = false;
    return { error, verdict, data };
  }

  const contentToScan = getText(context, eventType);
  if (!contentToScan) {
    return {
      error: new Error('No content found to scan.'),
      verdict: true,
      data,
    };
  }

  const direction = eventType === 'beforeRequestHook' ? 'IN' : 'OUT';

  const zscalerRequest: ZscalerExecutePolicyRequest = {
    policyId: pluginParams.policyId,
    direction: direction,
    content: contentToScan,
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.zscalerApiKey}`,
    };

    const zscalerResponse: ZscalerExecutePolicyResponse = await post(
      ZSCALER_EXECUTE_POLICY_URL,
      zscalerRequest,
      { headers },
      10000
    );

    data = {
      zscalerAction: zscalerResponse.action,
      detectorResponses: zscalerResponse.detectorResponses,
    };

    verdict = zscalerResponse.action !== 'BLOCK';

    if (!verdict) {
      error = new Error(
        'Zscaler AI Guard blocked the content with action: BLOCK'
      );
    }
  } catch (e: any) {
    // Default to blocking the request on any error
    verdict = false;

    // Check if the error is due to a 429 status code (Rate Limiting)
    if (e.response?.status === 429) {
      error = new Error('Zscaler AI Guard rate limit exceeded. Status: 429');
    } else if (e.response?.status >= 500 && e.response?.status < 600) {
      error = new Error(
        `Zscaler AI Guard API returned a server error. Status: ${e.response.status}`
      );
    } else {
      error =
        e instanceof Error
          ? e
          : new Error('An unknown error occurred during Zscaler API call.');
    }
    data = { originalError: e.message };
  }

  return {
    error,
    verdict,
    data,
  };
};
