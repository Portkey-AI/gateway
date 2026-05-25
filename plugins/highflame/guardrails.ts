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
  metadata?: Record<string, any>;
}

interface GuardrailConfig {
  name: string;
  config?: Record<string, any>;
}

// Shape preserved for backward-compat with any consumer that introspects
// `data.assessments` from the plugin's return value. Shield evaluates all
// configured policies in a single call, so the synthesized assessments here
// are labeled mirrors of whichever guardrail names the plugin was configured
// to evaluate, all sharing Shield's single decision/reason.
interface SynthesizedAssessment {
  [key: string]: {
    request_reject?: boolean;
    results?: {
      reject_prompt?: string;
    };
  };
}

interface ShieldGuardResponse {
  decision?: 'allow' | 'deny';
  actual_decision?: 'allow' | 'deny';
  reason?: string;
  request_id?: string;
  audit_id?: string;
  latency_ms?: number;
  redacted_content?: string;
  [key: string]: any;
}

interface HighflameGuardResult {
  shieldResponse: ShieldGuardResponse;
  synthesizedAssessments: SynthesizedAssessment[];
  // null = passthrough (5xx or 4xx); plugin should return verdict=true with a soft error
  passthroughError?: { message: string; status?: number; body?: string } | null;
}

// Default guardrail-name labels for the synthesized `data.assessments`
// mirror returned to the caller. Shield itself ignores these — it evaluates
// every policy bound to the project on every call.
const DEFAULT_GUARDRAILS: GuardrailConfig[] = [
  { name: 'trustsafety', config: { threshold: 0.75 } },
  { name: 'promptinjectiondetection', config: { threshold: 0.8 } },
];

function pickTenantContext(
  parameters: PluginParameters,
  credentials: HighflameCredentials
): { accountId?: string; projectId?: string } {
  const sources: Array<Record<string, any> | undefined> = [
    (parameters?.metadata as Record<string, any> | undefined) || undefined,
    credentials?.metadata,
  ];

  let accountId: string | undefined;
  let projectId: string | undefined;

  for (const src of sources) {
    if (!src) continue;
    if (!accountId) {
      accountId =
        (src.account_id as string | undefined) ||
        (src.highflame_account_id as string | undefined) ||
        (src.accountId as string | undefined);
    }
    if (!projectId) {
      projectId =
        (src.project_id as string | undefined) ||
        (src.highflame_project_id as string | undefined) ||
        (src.projectId as string | undefined);
    }
  }

  return { accountId, projectId };
}

async function callHighflameGuardrails(
  text: string,
  credentials: HighflameCredentials,
  guardrails: GuardrailConfig[] | undefined,
  tenant: { accountId?: string; projectId?: string },
  sessionId?: string
): Promise<HighflameGuardResult> {
  // Strip protocol and trailing slash from domain if present.
  let domain = credentials.domain || 'api.highflame.ai';
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const apiUrl = `https://${domain}/v1/guard`;

  console.log('[Highflame] Calling Shield API:', apiUrl);
  console.log('[Highflame] Application:', credentials.application);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-highflame-apikey': credentials.apiKey,
    'X-Product': 'guardrails',
  };

  if (credentials.application) {
    headers['x-highflame-application'] = credentials.application;
  }
  if (tenant.accountId) {
    headers['X-Account-ID'] = tenant.accountId;
  }
  if (tenant.projectId) {
    headers['X-Project-ID'] = tenant.projectId;
  }

  const requestBody: Record<string, any> = {
    content: text,
    content_type: 'prompt',
    action: 'process_prompt',
    mode: 'enforce',
    early_exit: true,
  };
  if (sessionId) {
    requestBody.session_id = sessionId;
  }

  console.log(
    '[Highflame] Shield request body keys:',
    Object.keys(requestBody).join(',')
  );

  // Pick which guardrail-name labels to mirror in the synthesized
  // assessments envelope. Shield ignores this list — it's only here so any
  // existing consumer that introspects the plugin's `data.assessments` shape
  // continues to see per-guardrail entries.
  const guardrailLabels =
    guardrails && guardrails.length > 0 ? guardrails : DEFAULT_GUARDRAILS;

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (e: any) {
    // Network-level error — bubble up so the handler's catch returns
    // verdict=true (passthrough) per the existing contract.
    throw e;
  }

  console.log('[Highflame] Shield response status:', response.status);

  if (response.status >= 500) {
    // Server-side failure — passthrough per firehog's behavior
    // (highflame-firehog/src/client/shield.rs:202-238).
    let body = '';
    try {
      body = await response.text();
    } catch (_) {
      // ignore
    }
    console.warn(
      '[Highflame] Shield 5xx — passthrough. status=' + response.status,
      body
    );
    return {
      shieldResponse: {},
      synthesizedAssessments: [],
      passthroughError: {
        message: `Highflame Shield ${response.status} ${response.statusText}`,
        status: response.status,
        body,
      },
    };
  }

  if (!response.ok) {
    // 4xx — log error with body and passthrough so the plugin doesn't
    // fail-closed on a misconfigured guardrail.
    let body = '';
    try {
      body = await response.text();
    } catch (_) {
      // ignore
    }
    console.error(
      '[Highflame] Shield 4xx error — passthrough. status=' + response.status,
      body
    );
    return {
      shieldResponse: {},
      synthesizedAssessments: [],
      passthroughError: {
        message: `Highflame Shield ${response.status} ${response.statusText}`,
        status: response.status,
        body,
      },
    };
  }

  const shieldResponse = (await response.json()) as ShieldGuardResponse;

  console.log('[Highflame] Shield decision:', shieldResponse.decision);
  console.log('[Highflame] Shield request_id:', shieldResponse.request_id);
  console.log('[Highflame] Shield audit_id:', shieldResponse.audit_id);

  const isDeny = shieldResponse.decision === 'deny';
  const reason =
    shieldResponse.reason ||
    (isDeny
      ? 'Request blocked by Highflame guardrails due to policy violation'
      : '');

  const synthesizedAssessments: SynthesizedAssessment[] = guardrailLabels.map(
    (g) => ({
      [g.name]: {
        request_reject: isDeny,
        results: {
          reject_prompt: isDeny ? reason : undefined,
        },
      },
    })
  );

  return {
    shieldResponse,
    synthesizedAssessments,
    passthroughError: null,
  };
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
  let data: any = null;

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
        metadata: parameters.metadata as Record<string, any> | undefined,
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
      error: `'parameters.credentials.apiKey' must be set`,
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

  const text = textArray.filter((t: any) => t).join('\n');
  console.log('[Highflame] Text to check (length):', text.length);

  // Per-guardrail config knobs are still accepted on the public surface for
  // backward compatibility, but Shield evaluates all configured policies in a
  // single call — the values here only drive which labels appear in the
  // synthesized `data.assessments` mirror.
  const guardrails = parameters.guardrails as GuardrailConfig[] | undefined;

  const tenant = pickTenantContext(parameters, credentials);
  const sessionId =
    (parameters?.metadata as Record<string, any> | undefined)?.session_id ||
    (context?.metadata as Record<string, any> | undefined)?.session_id;

  try {
    const result = await callHighflameGuardrails(
      text,
      credentials,
      guardrails,
      tenant,
      sessionId as string | undefined
    );

    if (result.passthroughError) {
      // 4xx/5xx from Shield — passthrough per the documented contract.
      verdict = true;
      error = {
        message: result.passthroughError.message,
        status: result.passthroughError.status,
        ...(result.passthroughError.body
          ? { body: result.passthroughError.body }
          : {}),
      };
      data = {
        passthrough: true,
        error_occurred: true,
        error_message: result.passthroughError.message,
      };
      console.log('[Highflame] Returning:', {
        verdict,
        hasError: !!error,
        hasData: !!data,
      });
      return { error, verdict, data };
    }

    const shield = result.shieldResponse;
    const isDeny = shield.decision === 'deny';
    const reason =
      shield.reason ||
      (isDeny
        ? 'Request blocked by Highflame guardrails due to policy violation'
        : '');

    if (isDeny) {
      // Build the per-guardrail flagged_assessments mirror so any downstream
      // PortKey logic that introspects per-guardrail results stays
      // compatible. Shield's single decision is replicated across each
      // configured guardrail-name label.
      const flaggedAssessments = result.synthesizedAssessments.map((a) => {
        const [type, body] = Object.entries(a)[0];
        return {
          type,
          request_reject: true,
          reject_prompt: body?.results?.reject_prompt || reason,
        };
      });

      console.log('[Highflame] Request REJECTED by Shield:', reason);

      verdict = false;
      // Preserve the existing semantics: on a policy-violation deny, use
      // the reject prompt as the `error` field so PortKey's deny flow can
      // surface it to the caller. (See test expectations.)
      error = reason;
      data = {
        flagged_assessments: flaggedAssessments,
        reject_prompt: reason,
        request_id: shield.request_id,
        audit_id: shield.audit_id,
        highflame_response: shield,
        // Synthesized per-guardrail mirror for backward-compat consumers.
        assessments: result.synthesizedAssessments,
      };
    } else {
      console.log('[Highflame] Request PASSED Shield guardrails');

      verdict = true;
      error = null;
      data = {
        all_passed: true,
        assessments: result.synthesizedAssessments,
        request_id: shield.request_id,
        audit_id: shield.audit_id,
        highflame_response: shield,
      };
    }
  } catch (e: any) {
    // Network / unexpected runtime errors — passthrough so PortKey doesn't
    // fail-closed on Shield being unreachable.
    console.error('[Highflame] Error calling Shield API:', e?.message);
    console.error('[Highflame] Error details:', e);

    error = {
      message: e?.message || 'Unknown error calling Highflame Shield API',
      name: e?.name,
      ...(e?.cause && { cause: e.cause }),
    };
    verdict = true;
    data = {
      error_occurred: true,
      error_message: e?.message,
    };
  }

  console.log('[Highflame] Returning:', {
    verdict,
    hasError: !!error,
    hasData: !!data,
  });

  return { error, verdict, data };
};
