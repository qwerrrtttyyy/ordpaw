import { Request, Response, NextFunction } from 'express';
import { OrdPawError, OrdPawErrorCode } from '@ordpaw/shared/errors';
import { logger } from './core/logger.js';

/**
 * 异步处理包装器 - 自动捕获 Promise rejection
 */
export function asyncHandler<T = unknown>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 自定义错误类
 */
export class ApiError extends OrdPawError {
  public statusCode: number;

  constructor(
    statusCode: number,
    message: string,
    code: string = OrdPawErrorCode.API_ERROR,
    details?: unknown
  ) {
    super(message, { status: statusCode, code, details });
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, OrdPawErrorCode.BAD_REQUEST, details);
  }

  static notFound(message: string = '资源不存在') {
    return new ApiError(404, message, OrdPawErrorCode.NOT_FOUND);
  }

  static internal(message: string = '服务器内部错误', details?: unknown) {
    return new ApiError(500, message, OrdPawErrorCode.INTERNAL_ERROR, details);
  }
}

/**
 * 统一错误处理中间件
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const timestamp = new Date().toISOString();

  if (err instanceof ApiError) {
    logger.error(
      { code: err.code, path: req.path, method: req.method, details: err.details },
      `[${timestamp}] ${err.code} ${req.method} ${req.path}: ${err.message}`
    );
    if (err.details) logger.error({ details: err.details }, '  details:');
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  // 未预期错误
  logger.error(
    { err, path: req.path, method: req.method },
    `[${timestamp}] UNEXPECTED ${req.method} ${req.path}:`
  );
  res.status(500).json({
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
}

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `[${timestamp}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 500) {
      logger.error(log);
    } else if (res.statusCode >= 400) {
      logger.warn(log);
    } else {
      logger.info(log);
    }
  });

  next();
}

/**
 * 简单的请求体验证
 */
export function validateBody<T>(
  schema: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'object' | 'array'>>
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const body = req.body || {};
    const errors: string[] = [];

    for (const [key, type] of Object.entries(schema)) {
      const value = body[key];
      if (value === undefined || value === null) {
        errors.push(`缺少必填字段: ${key}`);
        continue;
      }
      if (type === 'array' && !Array.isArray(value)) {
        errors.push(`字段 ${key} 必须是数组`);
      } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`字段 ${key} 必须是对象`);
      } else if (['string', 'number', 'boolean'].includes(type as string)) {
        if (typeof value !== type) {
          errors.push(`字段 ${key} 必须是 ${type}`);
        }
      }
    }

    if (errors.length > 0) {
      next(ApiError.badRequest('请求参数错误', errors));
      return;
    }
    next();
  };
}

/**
 * 404 处理
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: '路由不存在',
    code: 'ROUTE_NOT_FOUND',
    path: req.path,
  });
}
