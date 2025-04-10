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
      console.error('Error emitted from protectionManager', err);
    });
  }

  const acquireProtection = async () => {
    console.info('Acquiring protection');
    protectionCount++;
    try {
      await protectionManager.acquire();
    } catch (error) {
      console.error('Failed to acquire protection', error);
    }
  };

  const releaseProtection = async () => {
    console.info('Releasing protection');
    protectionCount--;
    if (protectionCount <= 0) {
      try {
        await protectionManager.release();
      } catch (error) {
        console.error('Failed to release protection', error);
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
