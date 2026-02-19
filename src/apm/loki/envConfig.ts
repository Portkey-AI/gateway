import { Environment } from '../../utils/env';

export const loadAndValidateEnv = () => {
  const env = Environment({}) as Record<string, string>;

  const lokiPushEnabled = env.LOKI_PUSH_ENABLED === 'true';

  // Only validate Loki-specific vars if Loki is enabled
  if (lokiPushEnabled) {
    const requiredForLoki = ['LOKI_AUTH', 'LOKI_HOST'];
    requiredForLoki.forEach((varName) => {
      if (!env[varName]) {
        console.error(
          `Missing required environment variable for Loki: ${varName}`
        );
        process.exit(1);
      }
    });
  }

  return {
    NODE_ENV: env.NODE_ENV || 'development',
    SERVICE_NAME: env.SERVICE_NAME || 'portkey-gateway',
    LOKI_AUTH: env.LOKI_AUTH || '',
    LOKI_HOST: env.LOKI_HOST || '',
    LOKI_PUSH_ENABLED: env.LOKI_PUSH_ENABLED || 'false',
  };
};
