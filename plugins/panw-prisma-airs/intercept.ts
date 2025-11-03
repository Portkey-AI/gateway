import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, post } from '../utils';

const AIRS_URL =
  'https://service.api.aisecurity.paloaltonetworks.com/v1/scan/sync/request';

const fetchAIRS = async (payload: any, apiKey: string) => {
  const opts = {
    headers: { 'x-pan-token': apiKey },
  };
  return post(AIRS_URL, payload, opts);
};

export const handler: PluginHandler = async (
  ctx: PluginContext,
  params: PluginParameters,
  hook: HookEventType
) => {
  const apiKey =
    (params.credentials?.AIRS_API_KEY as string | undefined) ||
    process.env.AIRS_API_KEY ||
    '';

  // Return verdict=true with error for missing credentials to allow traffic flow
  if (!apiKey || apiKey.trim() === '') {
    return {
      verdict: true,
      error:
        'AIRS_API_KEY is required but not configured. Please add your API key in the Portkey dashboard.',
      data: null,
    };
  }

  let verdict = true;
  let data: any = null;
  let error: any = null;

  try {
    const text = getText(ctx, hook); // prompt or response

    // Extract Portkey's trace ID from request headers to use as AIRS tr_id (AI Session ID)
    const traceId =
      ctx?.request?.headers?.['x-portkey-trace-id'] ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36));

    const payload: any = {
      tr_id: traceId, // Use Portkey's trace ID as AIRS AI Session ID
      metadata: {
        ai_model: params.ai_model ?? 'unknown-model',
        app_user: params.app_user ?? 'portkey-gateway',
        app_name: params.app_name ? `Portkey-${params.app_name}` : 'Portkey',
      },
      contents: [
        { [hook === 'beforeRequestHook' ? 'prompt' : 'response']: text },
      ],
    };

    // Only include ai_profile if profile_name or profile_id is provided
    if (params.profile_name || params.profile_id) {
      payload.ai_profile = {};
      if (params.profile_name) {
        payload.ai_profile.profile_name = params.profile_name;
      }
      if (params.profile_id) {
        payload.ai_profile.profile_id = params.profile_id;
      }
    }

    const res: any = await fetchAIRS(payload, apiKey);

    if (!res || typeof res.action !== 'string') {
      throw new Error('Malformed AIRS response');
    }
    if (res.action === 'block') {
      verdict = false;
    }
    data = res;
  } catch (e: any) {
    error = e;
    verdict = false;
  }

  return { verdict, data, error };
};
