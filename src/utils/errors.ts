/**
 * Custom error types for Dragon CLI
 */

export enum ErrorCode {
  // Config errors (1xxx)
  CONFIG_NOT_FOUND = 1001,
  CONFIG_INVALID = 1002,
  CONFIG_PARSE_ERROR = 1003,
  API_KEY_MISSING = 1004,

  // Provider errors (2xxx)
  PROVIDER_NOT_FOUND = 2001,
  PROVIDER_INIT_FAILED = 2002,
  API_REQUEST_FAILED = 2003,
  API_RATE_LIMIT = 2004,
  API_TIMEOUT = 2005,

  // Tool errors (3xxx)
  TOOL_NOT_FOUND = 3001,
  TOOL_EXECUTION_FAILED = 3002,
  TOOL_INVALID_PARAMS = 3003,
  TOOL_PERMISSION_DENIED = 3004,

  // File system errors (4xxx)
  FILE_NOT_FOUND = 4001,
  FILE_READ_ERROR = 4002,
  FILE_WRITE_ERROR = 4003,
  FILE_PERMISSION_DENIED = 4004,

  // Network errors (5xxx)
  NETWORK_ERROR = 5001,
  WEB_FETCH_FAILED = 5002,
  WEB_SEARCH_FAILED = 5003,

  // General errors (9xxx)
  UNKNOWN_ERROR = 9999,
  INVALID_INPUT = 9001,
  OPERATION_CANCELLED = 9002,
}

export class DragonError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DragonError';
    Error.captureStackTrace(this, this.constructor);
  }

  toString(): string {
    let msg = `[${this.name}:${this.code}] ${this.message}`;
    if (this.details) {
      msg += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }
    if (this.stack) {
      msg += `\nStack: ${this.stack}`;
    }
    return msg;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

// Config Errors
export class ConfigError extends DragonError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'ConfigError';
  }
}

export class ConfigNotFoundError extends ConfigError {
  constructor(configPath: string) {
    super(
      `Configuration file not found at ${configPath}`,
      ErrorCode.CONFIG_NOT_FOUND,
      { configPath }
    );
  }
}

export class ConfigInvalidError extends ConfigError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.CONFIG_INVALID, details);
  }
}

export class ApiKeyMissingError extends ConfigError {
  constructor(provider: string) {
    super(
      `API key missing for provider: ${provider}`,
      ErrorCode.API_KEY_MISSING,
      { provider }
    );
  }
}

// Provider Errors
export class ProviderError extends DragonError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'ProviderError';
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(provider: string) {
    super(
      `Provider not found: ${provider}`,
      ErrorCode.PROVIDER_NOT_FOUND,
      { provider }
    );
  }
}

export class ApiRequestError extends ProviderError {
  constructor(message: string, provider: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.API_REQUEST_FAILED, { provider, ...details });
  }
}

export class ApiRateLimitError extends ProviderError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      ErrorCode.API_RATE_LIMIT,
      { provider, retryAfter }
    );
  }
}

export class AuthenticationError extends ProviderError {
  constructor(message: string, provider: string) {
    super(
      `Authentication failed for ${provider}: ${message}`,
      ErrorCode.API_KEY_MISSING,
      { provider, reason: message }
    );
  }
}

export class APIKeyError extends ProviderError {
  constructor(message: string, provider: string) {
    super(
      `API key error for ${provider}: ${message}`,
      ErrorCode.API_KEY_MISSING,
      { provider, reason: message }
    );
  }
}

export class RateLimitError extends ProviderError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      ErrorCode.API_RATE_LIMIT,
      { provider, retryAfter }
    );
  }
}

// Tool Errors
export class ToolError extends DragonError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'ToolError';
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(tool: string) {
    super(`Tool not found: ${tool}`, ErrorCode.TOOL_NOT_FOUND, { tool });
  }
}

export class ToolExecutionError extends ToolError {
  constructor(tool: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Tool execution failed: ${tool} - ${reason}`,
      ErrorCode.TOOL_EXECUTION_FAILED,
      { tool, reason, ...details }
    );
  }
}

export class ToolInvalidParamsError extends ToolError {
  constructor(tool: string, validationError: string) {
    super(
      `Invalid parameters for tool ${tool}: ${validationError}`,
      ErrorCode.TOOL_INVALID_PARAMS,
      { tool, validationError }
    );
  }
}

// File System Errors
export class FileSystemError extends DragonError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'FileSystemError';
  }
}

export class FileNotFoundError extends FileSystemError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, ErrorCode.FILE_NOT_FOUND, { filePath });
  }
}

export class FilePermissionError extends FileSystemError {
  constructor(filePath: string, operation: string) {
    super(
      `Permission denied for ${operation} on ${filePath}`,
      ErrorCode.FILE_PERMISSION_DENIED,
      { filePath, operation }
    );
  }
}

// Network Errors
export class NetworkError extends DragonError {
  constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'NetworkError';
  }
}

export class WebFetchError extends NetworkError {
  constructor(url: string, reason: string) {
    super(
      `Failed to fetch ${url}: ${reason}`,
      ErrorCode.WEB_FETCH_FAILED,
      { url, reason }
    );
  }
}

// Utility function to check if error is a DragonError
export function isDragonError(error: unknown): error is DragonError {
  return error instanceof DragonError;
}

// Utility function to wrap unknown errors
export function wrapError(error: unknown, context?: string): DragonError {
  if (isDragonError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new DragonError(
      context ? `${context}: ${error.message}` : error.message,
      ErrorCode.UNKNOWN_ERROR,
      { originalError: error.message, stack: error.stack }
    );
  }

  return new DragonError(
    context || 'Unknown error occurred',
    ErrorCode.UNKNOWN_ERROR,
    { originalError: String(error) }
  );
}
