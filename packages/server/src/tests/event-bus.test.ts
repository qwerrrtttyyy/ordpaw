import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('eventBus', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('calls registered listener with enriched payload', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    const listener = vi.fn();

    eventBus.on('test:event', listener);
    await eventBus.emit('test:event', { foo: 'bar' });

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.foo).toBe('bar');
    expect(payload.__eventMeta).toMatchObject({ type: 'test:event' });
    expect(typeof payload.__eventMeta.time).toBe('number');
  });

  it('wraps primitive payloads in an object', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    const listener = vi.fn();

    eventBus.on('primitive', listener);
    await eventBus.emit('primitive', 42);

    expect(listener.mock.calls[0][0]).toMatchObject({ value: 42, __eventMeta: { type: 'primitive' } });
  });

  it('supports wildcard listeners', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    const listener = vi.fn();

    eventBus.on('*', listener);
    await eventBus.emit('any:event', { data: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].data).toBe(1);
  });

  it('removes listener via off', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    const listener = vi.fn();

    eventBus.on('removable', listener);
    eventBus.off('removable', listener);
    await eventBus.emit('removable', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates errors so other handlers still run', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    const good = vi.fn();

    eventBus.on('multi', bad);
    eventBus.on('multi', good);
    await eventBus.emit('multi', { x: 1 });

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('awaits async listeners', async () => {
    const { eventBus } = await import('../core/event-bus.js');
    let called = false;
    const listener = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      called = true;
    };

    eventBus.on('async', listener);
    await eventBus.emit('async', {});

    expect(called).toBe(true);
  });
});
