import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, post } from '../utils';
import { VERSION } from './version';

const buildApiUrl = (cloud: string): string =>
  `https://api.${cloud}.zseclipse.net/v1/detection/resolve-and-execute-policy`;

const fetchAIGuard = async (url: string, payload: any, apiKey: string) => {
  const opts = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': `portkey-ai-plugin/${VERSION}`,
    },
  };
  return post(url, payload, opts, 10000);
};

export const handler: PluginHandler = async (
  ctx: PluginContext,
  params: PluginParameters,
  hook: HookEventType
) => {
  const apiKey =
    (params.credentials?.AIGUARD_API_KEY as string | undefined) ||
    process.env.AIGUARD_API_KEY ||
    '';

  if (!apiKey || apiKey.trim() === '') {
    return {
      verdict: true,
      error:
        'AIGUARD_API_KEY is required but not configured. Please add your API key in the Portkey dashboard.',
      data: null,
    };
  }

  let verdict = true;
  let data: any = null;
  let error: any = null;

  try {
    const text = getText(ctx, hook);
    const cloud = params.cloud ?? 'us1';
    const url = buildApiUrl(cloud);

    const direction = hook === 'beforeRequestHook' ? 'IN' : 'OUT';

    const traceId =
      ctx?.request?.headers?.['x-portkey-trace-id'] ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36));

    const payload = {
      content: text,
      direction: direction,
      transaction_id: traceId,
    };

    const res: any = await fetchAIGuard(url, payload, apiKey);

    if (!res || typeof res.action !== 'string') {
      throw new Error('Malformed AI Guard response');
    }

    if (res.action.toLowerCase() === 'block') {
      verdict = false;
    }

    data = res;
  } catch (e: any) {
    error = e;
    verdict = false;
  }

  return { verdict, data, error };
};
