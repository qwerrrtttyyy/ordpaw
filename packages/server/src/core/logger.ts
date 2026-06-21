import pino from 'pino';

const logLevel = (process.env.LOG_LEVEL as pino.Level | undefined) || 'info';

const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

export const logger = pino({
  level: logLevel,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
