import { createLogger, transports, format } from 'winston';

export const ConsoleLogger = createLogger({
  transports: [new transports.Console()],
  format: format.combine(format.simple(), format.colorize()),
  level: 'debug',
});
