import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, post } from '../utils';

const AIRS_URL =
  'https://service.api.aisecurity.paloaltonetworks.com/v1/scan/sync/request';

const fetchAIRS = async (payload: any, apiKey: string, timeout?: number) => {
  const opts = {
    headers: { 'x-pan-token': apiKey },
  };
  return post(AIRS_URL, payload, opts, timeout);
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

  let verdict = true;
  let data: any = null;
  let error: any = null;

  try {
    const text = getText(ctx, hook); // prompt or response

    const payload = {
      tr_id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2) + Date.now().toString(36),
      ai_profile: {
        profile_name: params.profile_name ?? 'dev-block-all-profile',
      },
      metadata: {
        ai_model: params.ai_model ?? 'unknown-model',
        app_user: params.app_user ?? 'portkey-gateway',
      },
      contents: [
        { [hook === 'beforeRequestHook' ? 'prompt' : 'response']: text },
      ],
    };

    const res: any = await fetchAIRS(payload, apiKey, params.timeout);

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
