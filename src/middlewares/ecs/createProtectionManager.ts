import ECSProtectionManager from './ECSProtectionManager';
import { InMemoryProtectionManager } from './InMemoryProtectionManager';
import type { ProtectionSettings } from './types';

export function createProtectionManager(
  protectionSettings: ProtectionSettings
) {
  const protectionManager = process.env.ECS_AGENT_URI
    ? new ECSProtectionManager(protectionSettings)
    : new InMemoryProtectionManager();

  const acquireProtection = async () => {
    console.info('Acquiring protection');
    await protectionManager.acquire();
  };

  const releaseProtection = async () => {
    console.info('Releasing protection');
    await protectionManager.release();
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
