import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';

interface HighflameCredentials {
  apiKey: string;
  domain?: string;
  application?: string;
}

interface GuardrailConfig {
  name: string;
  config?: Record<string, any>;
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

// Default guardrails to run if none specified
const DEFAULT_GUARDRAILS: GuardrailConfig[] = [
  { name: 'trustsafety', config: { threshold: 0.75 } },
  { name: 'promptinjectiondetection', config: { threshold: 0.8 } },
];

async function callHighflameGuardrails(
  text: string,
  credentials: HighflameCredentials,
  guardrails?: GuardrailConfig[],
  globalThreshold?: number
): Promise<GuardrailsResponse> {
  // Strip https:// or http:// from domain if present
  let domain = credentials.domain || 'api-dev.highflame.dev';
  domain = domain.replace(/^https?:\/\//, '');

  const apiUrl = `https://${domain}/v1/guardrails/apply`;

  console.log('[Highflame] Calling API:', apiUrl);
  console.log('[Highflame] Application:', credentials.application);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-highflame-apikey': credentials.apiKey,
  };

  if (credentials.application) {
    headers['x-highflame-application'] = credentials.application;
  }

  // Use provided guardrails or defaults
  const guardrailsToRun =
    guardrails && guardrails.length > 0 ? guardrails : DEFAULT_GUARDRAILS;

  const requestBody: Record<string, any> = {
    input: { text },
    guardrails: guardrailsToRun,
  };

  // Add global config if threshold specified
  if (globalThreshold !== undefined) {
    requestBody.config = { threshold: globalThreshold };
  }

  console.log('[Highflame] Request body:', JSON.stringify(requestBody));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log('[Highflame] Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Highflame] API error:', errorText);
    throw new Error(
      `Highflame Guardrails API error: ${response.status} ${response.statusText} - ${errorText}`
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
  console.log('[Highflame] Handler called with eventType:', eventType);
  console.log(
    '[Highflame] Full parameters object:',
    JSON.stringify(parameters, null, 2)
  );
  console.log('[Highflame] Parameters keys:', Object.keys(parameters));

  let error = null;
  let verdict = true;
  let data = null;

  // Try multiple ways to get credentials
  let credentials = parameters.credentials as unknown as HighflameCredentials;

  // If credentials not at root, check if they're nested or direct properties
  if (!credentials || !credentials.apiKey) {
    console.log('[Highflame] Credentials not found at parameters.credentials');
    console.log('[Highflame] Trying direct properties...');

    // Check if credentials are passed as direct properties
    if (parameters.apiKey) {
      console.log('[Highflame] Found credentials as direct properties');
      credentials = {
        apiKey: parameters.apiKey as string,
        domain: parameters.domain as string | undefined,
        application: parameters.application as string | undefined,
      };
    }
  }

  console.log('[Highflame] Final credentials check:', {
    hasApiKey: !!credentials?.apiKey,
    hasDomain: !!credentials?.domain,
    hasApplication: !!credentials?.application,
    apiKeyLength: credentials?.apiKey?.length || 0,
    domain: credentials?.domain || 'none',
    application: credentials?.application || 'none',
  });

  if (!credentials?.apiKey) {
    console.error('[Highflame] Missing API key after all checks');
    return {
      error: `'parameters.credentials.apiKey' must be set. Received parameters keys: ${Object.keys(parameters).join(', ')}`,
      verdict: true,
      data,
    };
  }

  if (!credentials?.application) {
    console.error('[Highflame] Missing application name');
    return {
      error: `'parameters.credentials.application' must be set. Received: ${JSON.stringify(credentials)}`,
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    console.error('[Highflame] No content to check');
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
    };
  }

  const text = textArray.filter((text) => text).join('\n');
  console.log('[Highflame] Text to check (length):', text.length);

  // Get optional guardrails config from parameters
  const guardrails = parameters.guardrails as GuardrailConfig[] | undefined;
  const threshold = parameters.threshold as number | undefined;

  try {
    const response = await callHighflameGuardrails(
      text,
      credentials,
      guardrails,
      threshold
    );
    const assessments = response.assessments || [];

    console.log('[Highflame] Received', assessments.length, 'assessments');

    if (assessments.length === 0) {
      console.warn('[Highflame] No assessments in response');
      return {
        error: { message: 'No assessments in Highflame response' },
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
          '[Highflame] Assessment:',
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
          'Request blocked by Highflame guardrails due to policy violation';
      }

      console.log('[Highflame] Request REJECTED:', rejectPrompt);

      // Return with verdict false and NO error field for policy violations
      // Portkey will handle the deny logic based on guardrail actions
      verdict = false;
      error = null;
      data = {
        flagged_assessments: flaggedAssessments,
        reject_prompt: rejectPrompt,
        highflame_response: response,
      };
    } else {
      console.log('[Highflame] Request PASSED all guardrails');

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
    console.error('[Highflame] Error calling API:', e.message);
    console.error('[Highflame] Error details:', e);

    // Create a serializable error object
    error = {
      message: e.message || 'Unknown error calling Highflame API',
      name: e.name,
      ...(e.cause && { cause: e.cause }),
    };
    verdict = true; // Don't block on API errors
    data = {
      error_occurred: true,
      error_message: e.message,
    };
  }

  console.log('[Highflame] Returning:', {
    verdict,
    hasError: !!error,
    hasData: !!data,
  });

  return { error, verdict, data };
};
