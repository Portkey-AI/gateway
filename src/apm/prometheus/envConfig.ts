import { Environment } from '../../utils/env';

export const loadAndValidateEnv = (): { [key: string]: string } => {
  const env = Environment({}) as Record<string, string>;

  const prometheusPushEnabled = env.PROMETHEUS_PUSH_ENABLED === 'true';

  // Only validate Prometheus-specific vars if Prometheus push is enabled
  if (prometheusPushEnabled) {
    const requiredForPrometheus = [
      'PROMETHEUS_GATEWAY_URL',
      'PROMETHEUS_GATEWAY_AUTH',
    ];
    requiredForPrometheus.forEach((varName) => {
      if (!env[varName]) {
        console.error(
          `Missing required environment variable for Prometheus: ${varName}`
        );
        process.exit(1);
      }
    });
  }

  return {
    NODE_ENV: env.NODE_ENV || 'development',
    SERVICE_NAME: env.SERVICE_NAME || 'portkey-gateway',
    PROMETHEUS_GATEWAY_URL: env.PROMETHEUS_GATEWAY_URL || '',
    PROMETHEUS_GATEWAY_AUTH: env.PROMETHEUS_GATEWAY_AUTH || '',
    PROMETHEUS_PUSH_ENABLED: env.PROMETHEUS_PUSH_ENABLED || 'false',
  };
};
