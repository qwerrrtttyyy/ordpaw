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

export enum ErrorCode {
  CONFIG_ERROR = 'CONFIG_ERROR',
  DB_ERROR = 'DB_ERROR',
  MCP_ERROR = 'MCP_ERROR',
  PLUGIN_ERROR = 'PLUGIN_ERROR',
  SKILL_ERROR = 'SKILL_ERROR',
  COMPONENT_ERROR = 'COMPONENT_ERROR',
  AGENT_ERROR = 'AGENT_ERROR',
  SCRIPT_ERROR = 'SCRIPT_ERROR',
  DOWNLOAD_ERROR = 'DOWNLOAD_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
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
  readonly cause?: unknown;

  constructor(message: string, options: OrdPawErrorOptions = {}) {
    super(message);
    this.name = 'OrdPawError';
    this.status = options.status ?? 500;
    this.code = options.code ?? OrdPawErrorCode.INTERNAL_ERROR;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class OrdPawApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'OrdPawApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function createApiError(
  code: string,
  message: string,
  statusCode?: number,
  details?: unknown
): OrdPawApiError {
  return new OrdPawApiError(code, message, statusCode, details);
}
