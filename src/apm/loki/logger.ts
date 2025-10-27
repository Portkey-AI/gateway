const { loadAndValidateEnv } = await import('./envConfig.js');

let LokiLogger: any;

try {
  const { createLogger, transports, format } = await import('winston');
  const LokiTransport = await import('winston-loki');

  const envVars = loadAndValidateEnv();

  LokiLogger = createLogger({
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
} catch (error) {
  LokiLogger = null;
}

export { LokiLogger };
