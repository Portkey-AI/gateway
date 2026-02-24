import { createLogger, transports, format } from 'winston';
import LokiTransport from 'winston-loki';
import { loadAndValidateEnv } from './envConfig';

const envVars = loadAndValidateEnv();

const LokiLogger = createLogger({
  transports: [
    ...(envVars.LOKI_PUSH_ENABLED === 'true'
      ? [
          new LokiTransport({
            host: envVars.LOKI_HOST,
            basicAuth: envVars.LOKI_AUTH,
            labels: { app: envVars.SERVICE_NAME, env: envVars.NODE_ENV },
            json: true,
            format: format.json(),
            replaceTimestamp: true,
            onConnectionError: (err) => console.error(err),
          }),
        ]
      : []),
    new transports.Console({
      format: format.combine(format.simple(), format.colorize()),
    }),
  ],
});

export const getLokiLogger = () => {
  return LokiLogger;
};
