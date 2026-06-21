import type { EventCallback } from '@ordpaw/shared';
import { logger } from './logger.js';

class EventBusImpl {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const enrichedPayload = payload && typeof payload === 'object'
      ? { ...(payload as Record<string, unknown>), __eventMeta: { type: event, time: Date.now() } }
      : { value: payload, __eventMeta: { type: event, time: Date.now() } };

    const targets = [this.listeners.get(event), this.listeners.get('*')];
    for (const set of targets) {
      if (!set) continue;
      const callbacks = Array.from(set);
      for (const callback of callbacks) {
        try {
          await callback(enrichedPayload);
        } catch (error) {
          logger.error(error, `Event handler error for ${event}:`);
        }
      }
    }
  }
}

export const eventBus = new EventBusImpl();
