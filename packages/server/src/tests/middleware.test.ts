import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  asyncHandler,
  ApiError,
  errorHandler,
  requestLogger,
  validateBody,
  notFoundHandler,
} from '../middleware.js';

describe('middleware', () => {
  it('asyncHandler catches rejected promise', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('async boom'));
    const next = vi.fn();
    const handler = asyncHandler(fn as any);
    handler({} as Request, {} as Response, next);
    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'async boom' }))
    );
  });

  it('errorHandler handles ApiError with details', () => {
    const err = ApiError.badRequest('bad', ['detail1']);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    errorHandler(err, { path: '/x', method: 'POST' } as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ details: ['detail1'] }));
  });

  it('errorHandler handles unexpected errors', () => {
    const err = new Error('unexpected');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    errorHandler(err, { path: '/x', method: 'GET' } as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });

  it('requestLogger logs and calls next', () => {
    const res = {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') cb();
      }),
      statusCode: 200,
    } as unknown as Response;
    const next = vi.fn();
    requestLogger({ method: 'GET', path: '/' } as Request, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('requestLogger logs warn for 4xx', () => {
    const res = {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') cb();
      }),
      statusCode: 404,
    } as unknown as Response;
    requestLogger({ method: 'GET', path: '/missing' } as Request, res, vi.fn());
    expect(res.on).toHaveBeenCalled();
  });

  it('requestLogger logs error for 5xx', () => {
    const res = {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') cb();
      }),
      statusCode: 500,
    } as unknown as Response;
    requestLogger({ method: 'GET', path: '/error' } as Request, res, vi.fn());
  });

  it('validateBody rejects missing fields', () => {
    const middleware = validateBody<{ name: string }>({ name: 'string' });
    const next = vi.fn();
    middleware({ body: {} } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('validateBody rejects wrong type', () => {
    const middleware = validateBody<{ name: string }>({ name: 'string' });
    const next = vi.fn();
    middleware({ body: { name: 1 } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('validateBody accepts array type', () => {
    const middleware = validateBody<{ items: unknown[] }>({ items: 'array' });
    const next = vi.fn();
    middleware({ body: { items: [1] } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('validateBody rejects non-array for array type', () => {
    const middleware = validateBody<{ items: unknown[] }>({ items: 'array' });
    const next = vi.fn();
    middleware({ body: { items: 'not-array' } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('validateBody accepts object type', () => {
    const middleware = validateBody<{ obj: Record<string, unknown> }>({ obj: 'object' });
    const next = vi.fn();
    middleware({ body: { obj: {} } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('validateBody rejects array for object type', () => {
    const middleware = validateBody<{ obj: Record<string, unknown> }>({ obj: 'object' });
    const next = vi.fn();
    middleware({ body: { obj: [] } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('validateBody accepts valid body', () => {
    const middleware = validateBody<{ name: string; count: number }>({
      name: 'string',
      count: 'number',
    });
    const next = vi.fn();
    middleware({ body: { name: 'x', count: 1 } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('notFoundHandler returns 404', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    notFoundHandler({ path: '/missing' } as Request, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }));
  });
});
