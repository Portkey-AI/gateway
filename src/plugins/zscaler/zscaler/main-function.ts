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
  let verdict = true;
  let data: Record<string, any> = {};

  const credentials = parameters.credentials as ZscalerCredentials | undefined;
  const pluginParams = parameters.parameters as ZscalerPluginParameters;

  // :white_check_mark: FAIL OPEN (aligned with other plugins)
  if (!credentials?.zscalerApiKey) {
    return {
      error: new Error('Zscaler AI Guard API Key must be configured.'),
      verdict: true,
      data,
    };
  }

  if (!pluginParams?.policyId) {
    return {
      error: new Error('Zscaler AI Guard Policy ID must be configured.'),
      verdict: true,
      data,
    };
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
    direction,
    content: contentToScan,
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.zscalerApiKey}`,
    };

    const response: ZscalerExecutePolicyResponse = await post(
      ZSCALER_EXECUTE_POLICY_URL,
      zscalerRequest,
      { headers },
      10000
    );

    data = {
      zscalerAction: response.action,
      detectorResponses: response.detectorResponses,
    };

    // :white_check_mark: Check top-level action
    let isBlocked = response.action === 'BLOCK';

    // :white_check_mark: Also check individual detectors (if present)
    if (response.detectorResponses) {
      const detectorBlocked = Object.values(response.detectorResponses).some(
        (detector: any) => detector?.action === 'BLOCK'
      );

      isBlocked = isBlocked || detectorBlocked;
    }

    verdict = !isBlocked;

    if (!verdict) {
      data.blockReason =
        'Zscaler AI Guard blocked the content with action: BLOCK';
    }
  } catch (e: unknown) {
    verdict = false;

    const maybeError = e as any;
    const status = maybeError?.response?.status;

    // :white_check_mark: Proper 429 handling (your test will now pass)
    if (status === 429) {
      error = new Error('Zscaler AI Guard rate limit exceeded. Status: 429');
    }
    // :white_check_mark: Proper 5xx handling
    else if (status && status >= 500 && status < 600) {
      error = new Error(
        `Zscaler AI Guard API returned a server error. Status: ${status}`
      );
    }
    // :white_check_mark: Normal JS Error
    else if (e instanceof Error) {
      error = e;
    }
    // :white_check_mark: Fallback
    else {
      error = new Error('An unknown error occurred during Zscaler API call.');
    }

    data = { originalError: error.message };
  }

  return {
    error,
    verdict,
    data,
  };
};
