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

interface GuardrailAssessment {
  [key: string]: {
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
    results?: {
      categories?: Record<string, boolean>;
      category_scores?: Record<string, number>;
      lang?: string;
      prob?: number;
      reject_prompt?: string;
    };
    config?: {
      threshold_used?: number;
    };
    request_reject?: boolean;
  };
}

interface GuardrailsResponse {
  assessments: Array<GuardrailAssessment>;
}

async function callJavelinGuardrails(
  text: string,
  credentials: JavelinCredentials
): Promise<GuardrailsResponse> {
  // Strip https:// or http:// from domain if present
  let domain = credentials.domain || 'api-dev.javelin.live';
  domain = domain.replace(/^https?:\/\//, '');

  const apiUrl = `https://${domain}/v1/guardrails/apply`;

  console.log('[Javelin] Calling API:', apiUrl);
  console.log('[Javelin] Application:', credentials.application);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-javelin-apikey': credentials.apiKey,
  };

  if (credentials.application) {
    headers['x-javelin-application'] = credentials.application;
  }

  const requestBody = {
    input: { text },
    config: {},
    metadata: {},
  };

  console.log('[Javelin] Request body:', JSON.stringify(requestBody));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log('[Javelin] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Javelin] API error:', errorText);
    throw new Error(
      `Javelin Guardrails API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const responseData = await response.json();

  return responseData as GuardrailsResponse;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  console.log('[Javelin] Handler called with eventType:', eventType);
  console.log(
    '[Javelin] Full parameters object:',
    JSON.stringify(parameters, null, 2)
  );
  console.log('[Javelin] Parameters keys:', Object.keys(parameters));

  let error = null;
  let verdict = true;
  let data = null;

  // Try multiple ways to get credentials
  let credentials = parameters.credentials as unknown as JavelinCredentials;

  // If credentials not at root, check if they're nested or direct properties
  if (!credentials || !credentials.apiKey) {
    console.log('[Javelin] Credentials not found at parameters.credentials');
    console.log('[Javelin] Trying direct properties...');

    // Check if credentials are passed as direct properties
    if (parameters.apiKey) {
      console.log('[Javelin] Found credentials as direct properties');
      credentials = {
        apiKey: parameters.apiKey as string,
        domain: parameters.domain as string | undefined,
        application: parameters.application as string | undefined,
      };
    }
  }

  console.log('[Javelin] Final credentials check:', {
    hasApiKey: !!credentials?.apiKey,
    hasDomain: !!credentials?.domain,
    hasApplication: !!credentials?.application,
    apiKeyLength: credentials?.apiKey?.length || 0,
    domain: credentials?.domain || 'none',
    application: credentials?.application || 'none',
  });

  if (!credentials?.apiKey) {
    console.error('[Javelin] Missing API key after all checks');
    return {
      error: `'parameters.credentials.apiKey' must be set. Received parameters keys: ${Object.keys(parameters).join(', ')}`,
      verdict: true,
      data,
    };
  }

  if (!credentials?.application) {
    console.error('[Javelin] Missing application name');
    return {
      error: `'parameters.credentials.application' must be set. Received: ${JSON.stringify(credentials)}`,
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    console.error('[Javelin] No content to check');
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
    };
  }

  const text = textArray.filter((text) => text).join('\n');
  console.log('[Javelin] Text to check (length):', text.length);

  try {
    const response = await callJavelinGuardrails(text, credentials);
    const assessments = response.assessments || [];

    console.log('[Javelin] Received', assessments.length, 'assessments');

    if (assessments.length === 0) {
      console.warn('[Javelin] No assessments in response');
      return {
        error: { message: 'No assessments in Javelin response' },
        verdict: true,
        data: null,
      };
    }

    let shouldReject = false;
    let rejectPrompt = '';
    const flaggedAssessments: Array<{
      type: string;
      request_reject: boolean;
      categories?: Record<string, boolean>;
      category_scores?: Record<string, number>;
      threshold_used?: number;
    }> = [];

    // Check all assessments for violations
    for (const assessment of assessments) {
      for (const [assessmentType, assessmentData] of Object.entries(
        assessment
      )) {
        console.log(
          '[Javelin] Assessment:',
          assessmentType,
          'request_reject:',
          assessmentData.request_reject
        );

        if (assessmentData.request_reject === true) {
          shouldReject = true;

          // Extract reject prompt from results
          const results = assessmentData.results || {};
          if (results.reject_prompt && !rejectPrompt) {
            rejectPrompt = results.reject_prompt;
          }

          // Collect flagged assessment details
          flaggedAssessments.push({
            type: assessmentType,
            request_reject: true,
            categories: assessmentData.categories || results.categories,
            category_scores:
              assessmentData.category_scores || results.category_scores,
            threshold_used: assessmentData.config?.threshold_used,
          });
        }
      }
    }

    if (shouldReject) {
      // Use a default message if no reject_prompt was found
      if (!rejectPrompt) {
        rejectPrompt =
          'Request blocked by Javelin guardrails due to policy violation';
      }

      console.log('[Javelin] Request REJECTED:', rejectPrompt);

      // Return with verdict false and NO error field for policy violations
      // Portkey will handle the deny logic based on guardrail actions
      verdict = false;
      error = null;
      data = {
        flagged_assessments: flaggedAssessments,
        reject_prompt: rejectPrompt,
        javelin_response: response,
      };
    } else {
      console.log('[Javelin] Request PASSED all guardrails');

      // All guardrails passed
      verdict = true;
      error = null;
      data = {
        assessments: assessments,
        all_passed: true,
      };
    }
  } catch (e: any) {
    // Handle API errors - still return verdict true so Portkey doesn't block
    console.error('[Javelin] Error calling API:', e.message);
    console.error('[Javelin] Error details:', e);

    // Create a serializable error object
    error = {
      message: e.message || 'Unknown error calling Javelin API',
      name: e.name,
      ...(e.cause && { cause: e.cause }),
    };
    verdict = true; // Don't block on API errors
    data = {
      error_occurred: true,
      error_message: e.message,
    };
  }

  console.log('[Javelin] Returning:', {
    verdict,
    hasError: !!error,
    hasData: !!data,
  });

  return { error, verdict, data };
};
