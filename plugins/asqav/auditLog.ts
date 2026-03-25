import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText } from '../utils';

const ASQAV_API_BASE = 'https://api.asqav.com/api/v1';

interface AsqavSignResponse {
  signature_id: string;
  verification_url: string;
  algorithm: string;
  timestamp: string;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: any = null;

  try {
    const apiKey = parameters.credentials?.apiKey;
    if (!apiKey) {
      throw new Error(
        'Missing asqav API key. Set it in the credentials field.'
      );
    }

    const agentId =
      parameters.agentId || context.metadata?.agentId || 'portkey-gateway';

    const text = getText(context, eventType);
    const action =
      eventType === 'beforeRequestHook' ? 'llm_request' : 'llm_response';

    const payload: Record<string, any> = {
      action,
      data: {
        provider: context.provider || 'unknown',
        model: context.request?.json?.model || 'unknown',
        request_type: context.requestType || 'unknown',
        content_length: text.length,
        content_hash: await hashContent(text),
      },
    };

    if (parameters.includeContent) {
      payload.data.content = text.substring(0, 10000);
    }

    if (context.metadata) {
      payload.data.metadata = context.metadata;
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'X-Agent-Id': agentId,
    };

    const response = await post<AsqavSignResponse>(
      `${ASQAV_API_BASE}/sessions/sign`,
      payload,
      { headers },
      parameters.timeout || 5000
    );

    verdict = true;

    data = {
      signatureId: response.signature_id,
      verificationUrl: response.verification_url,
      algorithm: response.algorithm,
      timestamp: response.timestamp,
      action,
      agentId,
      explanation: `${action} signed with ${response.algorithm}. Verify: ${response.verification_url}`,
    };
  } catch (e: any) {
    const failOpen = parameters.failOpen !== false;
    error = failOpen ? null : e;
    verdict = failOpen;

    data = {
      explanation: `Asqav signing ${failOpen ? 'skipped' : 'failed'}: ${e.message}`,
      failOpen,
    };
  }

  return { error, verdict, data };
};

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
