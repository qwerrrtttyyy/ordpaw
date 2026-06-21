export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULT_LEVEL: LogLevel = 'info';

function detectLevel(): LogLevel {
  try {
    const envLevel = (import.meta as unknown as { env?: Record<string, string> }).env?.[
      'VITE_LOG_LEVEL'
    ];
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem('ordpaw:logLevel') : null;
    const level = envLevel || stored;
    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) return level as LogLevel;
  } catch {
    // localStorage 可能不可用
  }
  return DEFAULT_LEVEL;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = detectLevel();
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) console.debug('[OrdPaw]', ...args);
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) console.info('[OrdPaw]', ...args);
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) console.warn('[OrdPaw]', ...args);
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) console.error('[OrdPaw]', ...args);
  }
}

export const logger = new Logger();
