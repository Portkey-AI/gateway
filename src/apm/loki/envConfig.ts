import { Environment } from '../../utils/env';

const requiredEnvVars = ['NODE_ENV', 'SERVICE_NAME', 'LOKI_AUTH', 'LOKI_HOST'];

export const loadAndValidateEnv = () => {
  const env = Environment() as Record<string, string>;
  requiredEnvVars.forEach((varName) => {
    if (!env[varName]) {
      console.error(`Missing required environment variable: ${varName}`);
      process.exit(1);
    }
  });

  return {
    NODE_ENV: env.NODE_ENV!,
    SERVICE_NAME: env.SERVICE_NAME!,
    LOKI_AUTH: env.LOKI_AUTH!,
    LOKI_HOST: env.LOKI_HOST!,
    LOKI_PUSH_ENABLED: env.LOKI_PUSH_ENABLED!,
  };
};
