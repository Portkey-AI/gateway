import { logger } from '../../../apm';
import { uploadToLogStore } from '../../../services/winky';
import { HookResultLogObject, WinkyLogObject } from '../types';

export async function forwardToWinky(env: any, winkyLogObject: WinkyLogObject) {
  try {
    await uploadToLogStore(winkyLogObject, 'generations', true, env);
  } catch (error: any) {
    logger.error('forwardToWinky error: ', error);
  }
}

export async function forwardHookResultsToWinky(
  env: any,
  logObject: HookResultLogObject
) {
  try {
    await uploadToLogStore(logObject, 'hookResults', true, env);
  } catch (error: any) {
    logger.error('forwardHookResultsToWinky error: ', error);
  }
}

export async function forwardMCPLogToWinky(env: any, logObject: any) {
  try {
    await uploadToLogStore(logObject, 'mcp', true, env);
  } catch (error: any) {
    logger.error('forwardMCPLogToWinky error: ', error);
  }
}
