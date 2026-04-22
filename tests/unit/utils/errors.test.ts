import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorCode,
  DragonError,
  ConfigNotFoundError,
  ConfigInvalidError,
  ApiKeyMissingError,
  ProviderNotFoundError,
  ApiRequestError,
  ApiRateLimitError,
  RateLimitError,
  AuthenticationError,
  APIKeyError,
  ToolNotFoundError,
  ToolExecutionError,
  ToolInvalidParamsError,
  FileNotFoundError,
  FilePermissionError,
  WebFetchError,
  isDragonError,
  wrapError,
} from '../../../src/utils/errors.js';

describe('ErrorCode', () => {
  it('should have config error codes in 1xxx range', () => {
    expect(ErrorCode.CONFIG_NOT_FOUND).toBe(1001);
    expect(ErrorCode.CONFIG_INVALID).toBe(1002);
    expect(ErrorCode.CONFIG_PARSE_ERROR).toBe(1003);
    expect(ErrorCode.API_KEY_MISSING).toBe(1004);
  });

  it('should have provider error codes in 2xxx range', () => {
    expect(ErrorCode.PROVIDER_NOT_FOUND).toBe(2001);
    expect(ErrorCode.PROVIDER_INIT_FAILED).toBe(2002);
    expect(ErrorCode.API_REQUEST_FAILED).toBe(2003);
    expect(ErrorCode.API_RATE_LIMIT).toBe(2004);
    expect(ErrorCode.API_TIMEOUT).toBe(2005);
  });

  it('should have tool error codes in 3xxx range', () => {
    expect(ErrorCode.TOOL_NOT_FOUND).toBe(3001);
    expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe(3002);
    expect(ErrorCode.TOOL_INVALID_PARAMS).toBe(3003);
    expect(ErrorCode.TOOL_PERMISSION_DENIED).toBe(3004);
  });

  it('should have file system error codes in 4xxx range', () => {
    expect(ErrorCode.FILE_NOT_FOUND).toBe(4001);
    expect(ErrorCode.FILE_READ_ERROR).toBe(4002);
    expect(ErrorCode.FILE_WRITE_ERROR).toBe(4003);
    expect(ErrorCode.FILE_PERMISSION_DENIED).toBe(4004);
  });

  it('should have network error codes in 5xxx range', () => {
    expect(ErrorCode.NETWORK_ERROR).toBe(5001);
    expect(ErrorCode.WEB_FETCH_FAILED).toBe(5002);
    expect(ErrorCode.WEB_SEARCH_FAILED).toBe(5003);
  });

  it('should have general error codes in 9xxx range', () => {
    expect(ErrorCode.UNKNOWN_ERROR).toBe(9999);
    expect(ErrorCode.INVALID_INPUT).toBe(9001);
    expect(ErrorCode.OPERATION_CANCELLED).toBe(9002);
  });
});

describe('DragonError', () => {
  it('should create error with message and code', () => {
    const error = new DragonError('Test error', ErrorCode.UNKNOWN_ERROR);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.name).toBe('DragonError');
  });

  it('should include details when provided', () => {
    const error = new DragonError('Test error', ErrorCode.UNKNOWN_ERROR, { key: 'value' });
    expect(error.details).toEqual({ key: 'value' });
  });

  it('should format toString correctly', () => {
    const error = new DragonError('Test error', ErrorCode.UNKNOWN_ERROR, { key: 'value' });
    const str = error.toString();
    expect(str).toContain('[DragonError:9999]');
    expect(str).toContain('Test error');
    expect(str).toContain('Details');
  });

  it('should format toJSON correctly', () => {
    const error = new DragonError('Test error', ErrorCode.UNKNOWN_ERROR, { key: 'value' });
    const json = error.toJSON();
    expect(json.name).toBe('DragonError');
    expect(json.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(json.message).toBe('Test error');
    expect(json.details).toEqual({ key: 'value' });
  });

  it('should capture stack trace', () => {
    const error = new DragonError('Test error', ErrorCode.UNKNOWN_ERROR);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('DragonError');
  });
});

describe('ConfigNotFoundError', () => {
  it('should create error with config path', () => {
    const error = new ConfigNotFoundError('/path/to/config.json');
    expect(error.message).toContain('/path/to/config.json');
    expect(error.code).toBe(ErrorCode.CONFIG_NOT_FOUND);
    expect(error.details?.configPath).toBe('/path/to/config.json');
  });
});

describe('ConfigInvalidError', () => {
  it('should create error with message', () => {
    const error = new ConfigInvalidError('Invalid config');
    expect(error.message).toBe('Invalid config');
    expect(error.code).toBe(ErrorCode.CONFIG_INVALID);
  });

  it('should create error with details', () => {
    const error = new ConfigInvalidError('Invalid config', { field: 'apiKey' });
    expect(error.details?.field).toBe('apiKey');
  });
});

describe('ApiKeyMissingError', () => {
  it('should create error with provider name', () => {
    const error = new ApiKeyMissingError('openai');
    expect(error.message).toContain('openai');
    expect(error.code).toBe(ErrorCode.API_KEY_MISSING);
    expect(error.details?.provider).toBe('openai');
  });
});

describe('ProviderNotFoundError', () => {
  it('should create error with provider name', () => {
    const error = new ProviderNotFoundError('unknown-provider');
    expect(error.message).toContain('unknown-provider');
    expect(error.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
  });
});

describe('ApiRequestError', () => {
  it('should create error with provider and message', () => {
    const error = new ApiRequestError('Request failed', 'anthropic');
    expect(error.message).toBe('Request failed');
    expect(error.code).toBe(ErrorCode.API_REQUEST_FAILED);
    expect(error.details?.provider).toBe('anthropic');
  });

  it('should create error with additional details', () => {
    const error = new ApiRequestError('Request failed', 'anthropic', { status: 500 });
    expect(error.details?.status).toBe(500);
  });
});

describe('ApiRateLimitError', () => {
  it('should create error with provider', () => {
    const error = new ApiRateLimitError('openai');
    expect(error.message).toContain('Rate limit');
    expect(error.code).toBe(ErrorCode.API_RATE_LIMIT);
  });

  it('should include retry after when provided', () => {
    const error = new ApiRateLimitError('openai', 60);
    expect(error.message).toContain('60s');
    expect(error.details?.retryAfter).toBe(60);
  });
});

describe('RateLimitError', () => {
  it('should create error with provider', () => {
    const error = new RateLimitError('anthropic');
    expect(error.message).toContain('Rate limit');
    expect(error.code).toBe(ErrorCode.API_RATE_LIMIT);
  });

  it('should include retry after when provided', () => {
    const error = new RateLimitError('anthropic', 30);
    expect(error.message).toContain('30s');
  });
});

describe('AuthenticationError', () => {
  it('should create error with provider', () => {
    const error = new AuthenticationError('Invalid key', 'openai');
    expect(error.message).toContain('Authentication failed');
    expect(error.message).toContain('openai');
    expect(error.code).toBe(ErrorCode.API_KEY_MISSING);
  });
});

describe('APIKeyError', () => {
  it('should create error with provider', () => {
    const error = new APIKeyError('Key expired', 'gemini');
    expect(error.message).toContain('API key error');
    expect(error.message).toContain('gemini');
    expect(error.code).toBe(ErrorCode.API_KEY_MISSING);
  });
});

describe('ToolNotFoundError', () => {
  it('should create error with tool name', () => {
    const error = new ToolNotFoundError('unknown-tool');
    expect(error.message).toContain('unknown-tool');
    expect(error.code).toBe(ErrorCode.TOOL_NOT_FOUND);
  });
});

describe('ToolExecutionError', () => {
  it('should create error with tool and reason', () => {
    const error = new ToolExecutionError('bash', 'Command failed');
    expect(error.message).toContain('bash');
    expect(error.message).toContain('Command failed');
    expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
  });

  it('should create error with details', () => {
    const error = new ToolExecutionError('bash', 'Failed', { exitCode: 1 });
    expect(error.details?.exitCode).toBe(1);
  });
});

describe('ToolInvalidParamsError', () => {
  it('should create error with tool and validation error', () => {
    const error = new ToolInvalidParamsError('read', 'Missing required field: path');
    expect(error.message).toContain('read');
    expect(error.message).toContain('Missing required field');
    expect(error.code).toBe(ErrorCode.TOOL_INVALID_PARAMS);
  });
});

describe('FileNotFoundError', () => {
  it('should create error with file path', () => {
    const error = new FileNotFoundError('/path/to/file.txt');
    expect(error.message).toContain('/path/to/file.txt');
    expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
  });
});

describe('FilePermissionError', () => {
  it('should create error with file path and operation', () => {
    const error = new FilePermissionError('/path/to/file.txt', 'read');
    expect(error.message).toContain('Permission denied');
    expect(error.code).toBe(ErrorCode.FILE_PERMISSION_DENIED);
    expect(error.details?.operation).toBe('read');
  });
});

describe('WebFetchError', () => {
  it('should create error with url and reason', () => {
    const error = new WebFetchError('https://example.com', 'Network error');
    expect(error.message).toContain('https://example.com');
    expect(error.code).toBe(ErrorCode.WEB_FETCH_FAILED);
  });
});

describe('isDragonError', () => {
  it('should return true for DragonError instances', () => {
    const error = new DragonError('Test', ErrorCode.UNKNOWN_ERROR);
    expect(isDragonError(error)).toBe(true);
    expect(isDragonError(new ConfigNotFoundError('/path'))).toBe(true);
    expect(isDragonError(new ApiKeyMissingError('test'))).toBe(true);
    expect(isDragonError(new RateLimitError('test'))).toBe(true);
    expect(isDragonError(new AuthenticationError('test', 'test'))).toBe(true);
    expect(isDragonError(new APIKeyError('test', 'test'))).toBe(true);
  });

  it('should return false for non-DragonError errors', () => {
    const error = new Error('Regular error');
    expect(isDragonError(error)).toBe(false);
    expect(isDragonError('string')).toBe(false);
    expect(isDragonError(null)).toBe(false);
    expect(isDragonError(undefined)).toBe(false);
    expect(isDragonError(123)).toBe(false);
    expect(isDragonError({})).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return DragonError as-is', () => {
    const original = new ApiKeyMissingError('test');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap Error instances', () => {
    const error = new Error('Test error');
    const wrapped = wrapError(error);
    expect(wrapped.message).toBe('Test error');
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });

  it('should wrap Error with context', () => {
    const error = new Error('Test error');
    const wrapped = wrapError(error, 'Context message');
    expect(wrapped.message).toContain('Context message');
    expect(wrapped.message).toContain('Test error');
  });

  it('should wrap non-Error values', () => {
    const wrapped = wrapError('string error');
    expect(wrapped.message).toBe('Unknown error occurred');
    expect(wrapped.details?.originalError).toBe('string error');
  });

  it('should wrap with context for non-Error values', () => {
    const wrapped = wrapError(null, 'Something went wrong');
    expect(wrapped.message).toBe('Something went wrong');
  });

  it('should wrap numbers', () => {
    const wrapped = wrapError(404);
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(wrapped.details?.originalError).toBe('404');
  });

  it('should wrap objects', () => {
    const wrapped = wrapError({ code: 'CUSTOM' });
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
  });
});
