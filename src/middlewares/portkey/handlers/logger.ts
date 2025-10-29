import { Env } from 'hono';

export function forwardMCPLogToWinky(env: Env, record: any) {
  console.log(record);
}
