import type { DebugLogEntry, DebugEventEntry } from '@ordpaw/shared';
import { eventBus } from './event-bus.js';

const MAX_LOGS = 500;
const MAX_EVENTS = 300;

class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private events: DebugEventEntry[] = [];
  private listeners = new Set<(entry: DebugLogEntry) => void>();
  private eventListeners = new Set<(event: DebugEventEntry) => void>();
  private debugMode = false;

  constructor() {
    // 订阅所有事件总线事件
    eventBus.on('*', (payload: unknown) => {
      const meta = (payload as Record<string, unknown> | undefined)?.__eventMeta as
        | Record<string, unknown>
        | undefined;
      const type = typeof meta?.type === 'string' ? meta.type : 'unknown';
      this.pushEvent(type, payload);
    });
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  isDebugMode() {
    return this.debugMode;
  }

  log(
    level: DebugLogEntry['level'],
    message: string,
    source?: string,
    metadata?: Record<string, unknown>
  ) {
    const entry: DebugLogEntry = {
      id: Math.random().toString(36).slice(2, 10),
      time: Date.now(),
      level,
      message,
      source,
      metadata,
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) this.logs.pop();
    this.listeners.forEach((fn) => fn(entry));
  }

  pushEvent(type: string, payload: unknown) {
    const entry: DebugEventEntry = {
      id: Math.random().toString(36).slice(2, 10),
      time: Date.now(),
      type,
      payload,
    };
    this.events.unshift(entry);
    if (this.events.length > MAX_EVENTS) this.events.pop();
    this.eventListeners.forEach((fn) => fn(entry));
  }

  getLogs(level?: DebugLogEntry['level'], limit = 100): DebugLogEntry[] {
    let list = this.logs;
    if (level) {
      list = list.filter((l) => l.level === level);
    }
    return list.slice(0, limit);
  }

  getEvents(type?: string, limit = 100): DebugEventEntry[] {
    let list = this.events;
    if (type) {
      list = list.filter((e) => e.type === type);
    }
    return list.slice(0, limit);
  }

  clearLogs() {
    this.logs = [];
  }

  clearEvents() {
    this.events = [];
  }

  subscribe(listener: (entry: DebugLogEntry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeEvents(listener: (event: DebugEventEntry) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
}

export const debugLogger = new DebugLogger();
