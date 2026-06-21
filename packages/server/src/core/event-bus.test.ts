import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './event-bus.js';

describe('eventBus', () => {
  it('emits to subscribed listeners', async () => {
    const listener = vi.fn();
    eventBus.on('test:event', listener);
    await eventBus.emit('test:event', { value: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].value).toBe(1);
    expect(listener.mock.calls[0][0].__eventMeta.type).toBe('test:event');
    eventBus.off('test:event', listener);
  });

  it('supports wildcard listeners', async () => {
    const listener = vi.fn();
    eventBus.on('*', listener);
    await eventBus.emit('any:event', { value: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    eventBus.off('*', listener);
  });

  it('does not call removed listeners', async () => {
    const listener = vi.fn();
    eventBus.on('removed:event', listener);
    eventBus.off('removed:event', listener);
    await eventBus.emit('removed:event', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates errors in listeners', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    const good = vi.fn();
    eventBus.on('multi', bad);
    eventBus.on('multi', good);
    await eventBus.emit('multi', {});
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    eventBus.off('multi', bad);
    eventBus.off('multi', good);
  });
});
