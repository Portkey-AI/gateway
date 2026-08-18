import * as utils from '../utils';
import { VERSION } from './version';

export const DEFAULT_API_BASE = 'https://trustguard.neuraltrust.ai';
export const EVALUATE_PATH = '/v1/evaluate';
export const DEFAULT_TIMEOUT = 5000;

export const STATUS_ALLOW = 'allow';
export const STATUS_BLOCK = 'block';
export const STATUS_TRANSFORM = 'transform';
export const STATUS_REPORT = 'report';

export const TRUSTGUARD_STATUSES = [
  STATUS_ALLOW,
  STATUS_BLOCK,
  STATUS_TRANSFORM,
  STATUS_REPORT,
] as const;

export type TrustGuardStatus = (typeof TRUSTGUARD_STATUSES)[number];

export const KNOWN_STATUSES = new Set<string>(TRUSTGUARD_STATUSES);

export const UNREACHABLE_HTTP_STATUSES = new Set([502, 504]);
export const AUTH_HTTP_STATUSES = new Set([401, 403]);

export async function postTrustGuard(
  url: string,
  body: unknown,
  apiKey: string,
  timeout: number
): Promise<unknown> {
  return utils.post(
    url,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': `portkey-ai-plugin/${VERSION}`,
      },
    },
    timeout
  );
}
