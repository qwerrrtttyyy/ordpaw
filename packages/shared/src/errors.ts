export enum OrdPawErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  UNKNOWN = 'UNKNOWN',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  API_ERROR = 'API_ERROR',
}

export interface OrdPawErrorOptions {
  status?: number;
  code?: OrdPawErrorCode | string;
  details?: unknown;
  cause?: unknown;
}

export class OrdPawError extends Error {
  readonly status: number;
  readonly code: OrdPawErrorCode | string;
  readonly details?: unknown;

  constructor(message: string, options: OrdPawErrorOptions = {}) {
    super(message);
    this.name = 'OrdPawError';
    this.status = options.status ?? 500;
    this.code = options.code ?? OrdPawErrorCode.INTERNAL_ERROR;
    this.details = options.details;
  }
}

export type ErrorCode = Lowercase<OrdPawErrorCode> | (string & {});
