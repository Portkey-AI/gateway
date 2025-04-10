import * as Sentry from '@sentry/node';
import ECSProtectionManager from './ECSProtectionManager';
import { InMemoryProtectionManager } from './InMemoryProtectionManager';
import type { ProtectionSettings } from './types';

export function createProtectionManager(
  protectionSettings: ProtectionSettings
) {
  let protectionCount = 0;
  const protectionManager = process.env.ECS_AGENT_URI
    ? new ECSProtectionManager(protectionSettings)
    : new InMemoryProtectionManager();

  if ('on' in protectionManager) {
    protectionManager.on('error', (err) => {
      Sentry.captureException(err);
    });
  }

  const acquireProtection = async () => {
    protectionCount++;
    try {
      await protectionManager.acquire();
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const releaseProtection = async () => {
    protectionCount--;
    if (protectionCount <= 0) {
      try {
        await protectionManager.release();
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  };

  return {
    acquireProtection,
    releaseProtection,
    get currentState() {
      return protectionManager.currentState;
    },
    close() {
      protectionManager.close();
    },
  };
}
