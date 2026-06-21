import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SequenceExecutor } from '../sequence-executor';

describe('SequenceExecutor', () => {
  let executor: SequenceExecutor;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let store: { getSettings: ReturnType<typeof vi.fn>; setSettings: ReturnType<typeof vi.fn> };
  let ws: WebSocket;

  beforeEach(() => {
    router = { navigate: vi.fn() };
    store = {
      getSettings: vi.fn(() => ({ theme: 'ordpaw-light' })),
      setSettings: vi.fn()
    };
    executor = new SequenceExecutor(router, store);
    ws = {
      send: vi.fn(),
      addEventListener: vi.fn()
    } as unknown as WebSocket;
    executor.connect(ws);
  });

  it('connects and sets up message handlers', () => {
    expect(ws.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('handles sequence:start message', () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:start',
        payload: {
          sequence: { id: 'seq-1', operations: [{ id: 'op-1', type: 'ui:navigate', params: { route: '/home' } }] }
        }
      })
    });
    expect(ws.send).toHaveBeenCalled();
  });

  it('handles ui:navigate operation', async () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:start',
        payload: { sequence: { id: 'seq-1', operations: [] } }
      })
    });
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'ui:navigate', params: { route: '/home' } }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));
    expect(router.navigate).toHaveBeenCalledWith('/home');
  });

  it('handles ui:click operation', async () => {
    const el = document.createElement('button');
    el.id = 'test-btn';
    document.body.appendChild(el);

    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'ui:click', params: { selector: '#test-btn' } }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));

    document.body.removeChild(el);
  });

  it('handles ui:theme operation', async () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:start',
        payload: { sequence: { id: 'seq-1', operations: [] } }
      })
    });
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'ui:theme', params: { theme: 'ordpaw-dark' } }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));
    expect(store.setSettings).toHaveBeenCalled();
  });

  it('handles ui:input operation', async () => {
    const el = document.createElement('input');
    el.id = 'test-input';
    document.body.appendChild(el);

    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:start',
        payload: { sequence: { id: 'seq-1', operations: [] } }
      })
    });
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'ui:input', params: { selector: '#test-input', value: 'hello' } }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));
    expect((el as HTMLInputElement).value).toBe('hello');

    document.body.removeChild(el);
  });

  it('handles ui:scroll operation', async () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'ui:scroll', params: { position: 'top' } }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));
  });

  it('handles unknown operation types', async () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:start',
        payload: { sequence: { id: 'seq-1', operations: [] } }
      })
    });
    listener({
      data: JSON.stringify({
        type: 'sequence:execute',
        payload: {
          sequenceId: 'seq-1',
          operationIndex: 0,
          totalOperations: 1,
          operation: { id: 'op-1', type: 'unknown:type', params: {} }
        }
      })
    });
    await new Promise(r => setTimeout(r, 50));
    expect(ws.send).toHaveBeenCalled();
  });

  it('handles sequence:complete message', () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:complete',
        payload: { sequenceId: 'seq-1', summary: {} }
      })
    });
  });

  it('handles sequence:progress message', () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({
      data: JSON.stringify({
        type: 'sequence:progress',
        payload: { sequenceId: 'seq-1', status: 'paused' }
      })
    });
  });

  it('ignores malformed messages', () => {
    const listener = (ws.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
    listener({ data: 'not-json' });
  });
});
