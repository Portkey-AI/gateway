import { HookResultLogObject, LogObject, WinkyLogObject } from '../types';

export async function forwardToWinky(env: any, winkyLogObject: WinkyLogObject) {
  try {
    await env.winky.fetch(env.WINKY_WORKER_BASEPATH, {
      method: 'POST',
      body: JSON.stringify(winkyLogObject),
      headers: {
        'Content-Type': 'application/json',
        'x-client-id-gateway': env.CLIENT_ID,
      },
    });
  } catch (error) {
    console.error(error);
  }
}

export async function forwardLogsToWinky(env: any, logObjects: LogObject[]) {
  try {
    await env.winky.fetch(`${env.GATEWAY_BASEPATH}/logs`, {
      method: 'POST',
      body: JSON.stringify(logObjects),
      headers: {
        'Content-Type': 'application/json',
        'x-client-id-gateway': env.CLIENT_ID,
      },
    });
  } catch (error) {
    console.error(error);
  }
}

export async function forwardHookResultsToWinky(
  env: any,
  logObject: HookResultLogObject
) {
  try {
    await env.winky.fetch(`${env.WINKY_WORKER_BASEPATH}/logs/hook-results`, {
      method: 'POST',
      body: JSON.stringify(logObject),
      headers: {
        'Content-Type': 'application/json',
        'x-client-id-gateway': env.CLIENT_ID,
      },
    });
  } catch (error) {
    console.error(error);
  }
}
