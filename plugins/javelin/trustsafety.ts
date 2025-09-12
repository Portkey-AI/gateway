import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';

interface JavelinCredentials {
  apiKey: string;
  domain?: string;
  application?: string;
}

interface TrustSafetyResponse {
  assessments: Array<{
    trustsafety: {
      categories?: Record<string, boolean>;
      category_scores?: Record<string, number>;
      results?: {
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      };
      config?: {
        threshold_used?: number;
      };
      request_reject?: boolean;
    };
  }>;
}

async function callJavelinTrustSafety(
  text: string,
  credentials: JavelinCredentials,
  threshold: number = 0.75
): Promise<TrustSafetyResponse> {
  const domain = credentials.domain || 'api-dev.javelin.live';
  const apiUrl = `https://${domain}/v1/guardrail/trustsafety/apply`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-javelin-apikey': credentials.apiKey,
  };

  if (credentials.application) {
    headers['x-javelin-application'] = credentials.application;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { text },
      config: { threshold },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Javelin Trust & Safety API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  const credentials = parameters.credentials as unknown as JavelinCredentials;
  if (!credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
    };
  }

  const text = textArray.filter((text) => text).join('\n');

  try {
    const threshold = parameters.threshold || 0.75;
    const response = await callJavelinTrustSafety(text, credentials, threshold);
    const assessment = response.assessments[0];
    const trustSafetyData = assessment.trustsafety;

    if (!trustSafetyData) {
      return {
        error: { message: 'Invalid response from Javelin Trust & Safety API' },
        verdict: true,
        data: null,
      };
    }

    // Check if any category is flagged as true
    const categories =
      trustSafetyData.categories || trustSafetyData.results?.categories || {};
    const flaggedCategories = Object.entries(categories).filter(
      ([_, flagged]) => flagged
    );

    if (flaggedCategories.length > 0) {
      verdict = false;
      data = {
        flagged_categories: flaggedCategories.map(([category]) => category),
        category_scores:
          trustSafetyData.category_scores ||
          trustSafetyData.results?.category_scores ||
          {},
        threshold_used: trustSafetyData.config?.threshold_used,
        request_reject: trustSafetyData.request_reject || false,
      };
    } else {
      data = {
        category_scores:
          trustSafetyData.category_scores ||
          trustSafetyData.results?.category_scores ||
          {},
        threshold_used: trustSafetyData.config?.threshold_used,
        request_reject: trustSafetyData.request_reject || false,
      };
    }
  } catch (e: any) {
    error = e;
  }

  return { error, verdict, data };
};
