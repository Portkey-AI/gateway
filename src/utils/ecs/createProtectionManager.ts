import ECSProtectionManager from './ECSProtectionManager';
import { InMemoryProtectionManager } from './InMemoryProtectionManager';
import type { ProtectionSettings } from './types';

export function createProtectionManager(
  protectionSettings: ProtectionSettings
) {
  const protectionManager = process.env.ECS_AGENT_URI
    ? new ECSProtectionManager(protectionSettings)
    : new InMemoryProtectionManager();

  if ('on' in protectionManager) {
    protectionManager.on('error', () => {
      console.error('Protection manager error');
    });
  }

  const acquireProtection = async () => {
    //console.info('Acquiring protection');
    try {
      await protectionManager.acquire();
    } catch (error) {
      console.error('Failed to acquire protection', error);
    }
  };

  const releaseProtection = async () => {
    //console.info('Releasing protection');
    try {
      await protectionManager.release();
    } catch (error) {
      console.error('Failed to release protection', error);
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
