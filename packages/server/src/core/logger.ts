export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

const ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): LogLevel {
  const env = (process.env.ORDPAW_LOG_LEVEL || 'info').toLowerCase();
  if (env in ORDER) return env as LogLevel;
  return 'info';
}

function format(level: LogLevel, source: string | undefined, message: string): string {
  const prefix = source ? `[${source}]` : '';
  const ts = new Date().toISOString();
  return `${ts} [${level.toUpperCase()}]${prefix} ${message}`;
}

function shouldLog(level: LogLevel): boolean {
  return ORDER[level] >= ORDER[currentLevel()];
}

export function createLogger(source?: string): Logger {
  return {
    debug: (message, ...args) => {
      if (shouldLog('debug')) console.debug(format('debug', source, message), ...args);
    },
    info: (message, ...args) => {
      if (shouldLog('info')) console.log(format('info', source, message), ...args);
    },
    warn: (message, ...args) => {
      if (shouldLog('warn')) console.warn(format('warn', source, message), ...args);
    },
    error: (message, ...args) => {
      if (shouldLog('error')) console.error(format('error', source, message), ...args);
    },
  };
}

export const logger = createLogger();
