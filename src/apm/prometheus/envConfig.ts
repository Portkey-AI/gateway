import { Environment } from '../../utils/env';

const requiredEnvVars = [
  'NODE_ENV',
  'SERVICE_NAME',
  'PROMETHEUS_GATEWAY_URL',
  'PROMETHEUS_GATEWAY_AUTH',
];

export const loadAndValidateEnv = (): { [key: string]: string } => {
  const env = Environment({}) as Record<string, string>;
  requiredEnvVars.forEach((varName) => {
    if (!env[varName]) {
      console.error(`Missing required environment variable: ${varName}`);
      process.exit(1);
    }
  });

  return {
    NODE_ENV: env.NODE_ENV!,
    SERVICE_NAME: env.SERVICE_NAME!,
    PROMETHEUS_GATEWAY_URL: env.PROMETHEUS_GATEWAY_URL!,
    PROMETHEUS_GATEWAY_AUTH: env.PROMETHEUS_GATEWAY_AUTH!,
    PROMETHEUS_PUSH_ENABLED: env.PROMETHEUS_PUSH_ENABLED!,
  };
};
