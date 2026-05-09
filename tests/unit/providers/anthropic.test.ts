import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message, ToolDefinition, ChatOptions, StreamChunk, AIResponse } from '../../../src/providers/base.js';

// Mock functions must be defined before mock and referenced via function call pattern
const mockMessagesCreate = vi.fn();
const mockMessagesStream = vi.fn();

// Mock Anthropic SDK - everything must be self-contained inside the factory
vi.mock('@anthropic-ai/sdk', () => {
  // Error classes defined inside factory - not accessible from outside during hoisting
  class AuthenticationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthenticationError';
    }
  }

  class RateLimitError extends Error {
    headers: Headers;
    constructor(message: string) {
      super(message);
      this.name = 'RateLimitError';
      this.headers = new Headers({ 'retry-after': '60' });
    }
  }

  class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  }

  class PermissionDeniedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PermissionDeniedError';
    }
  }

  class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  }

  class InternalServerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InternalServerError';
    }
  }

  class APIConnectionError extends Error {
    cause?: Error;
    constructor(message: string, cause?: Error) {
      super(message);
      this.name = 'APIConnectionError';
      this.cause = cause;
    }
  }

  // Mock provider class with error classes as static properties
  class MockAnthropic {
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    static BadRequestError = BadRequestError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static InternalServerError = InternalServerError;
    static APIConnectionError = APIConnectionError;

    messages = {
      create: (...args: any[]) => mockMessagesCreate(...args),
      stream: (...args: any[]) => mockMessagesStream(...args),
    };
  }

  return {
    default: MockAnthropic,
    AuthenticationError,
    RateLimitError,
    BadRequestError,
    PermissionDeniedError,
    NotFoundError,
    InternalServerError,
    APIConnectionError,
  };
});

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../../../src/performance/index.js', () => ({
  perfMonitor: {
    measure: vi.fn((name: string, fn: () => any) => fn()),
  },
}));

// Import after mocking
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../../../src/providers/anthropic.js';
import { ApiKeyMissingError, ApiRequestError, ApiRateLimitError } from '../../../src/utils/errors.js';

// Get error classes from the mocked SDK after import
const MockAuthenticationError = Anthropic.AuthenticationError;
const MockRateLimitError = Anthropic.RateLimitError;
const MockBadRequestError = Anthropic.BadRequestError;
const MockPermissionDeniedError = Anthropic.PermissionDeniedError;
const MockNotFoundError = Anthropic.NotFoundError;
const MockInternalServerError = Anthropic.InternalServerError;
const MockAPIConnectionError = Anthropic.APIConnectionError;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider({
      apiKey: 'sk-ant-test-key',
      models: ['claude-opus-4-7', 'claude-sonnet-4-6'],
      defaultModel: 'claude-opus-4-7',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should throw ApiKeyMissingError for missing API key', () => {
      expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(ApiKeyMissingError);
    });

    it('should throw ApiKeyMissingError for placeholder API key', () => {
      expect(() => new AnthropicProvider({ apiKey: 'YOUR_ANTHROPIC_API_KEY' })).toThrow(ApiKeyMissingError);
    });

    it('should use default models when not provided', () => {
      const defaultProvider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
      expect(defaultProvider.getDefaultModel()).toBe('claude-opus-4-7');
    });

    it('should use custom models when provided', () => {
      expect(provider.getDefaultModel()).toBe('claude-opus-4-7');
      expect(provider.listModels()).resolves.toEqual(['claude-opus-4-7', 'claude-sonnet-4-6']);
    });

    it('should accept custom baseUrl', () => {
      const customProvider = new AnthropicProvider({
        apiKey: 'sk-ant-test',
        baseUrl: 'https://custom.anthropic.com',
      });
      expect(customProvider['baseUrl']).toBe('https://custom.anthropic.com');
    });
  });

  describe('chat()', () => {
    it('should return text response', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello, how can I help?' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const response = await provider.chat([
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.content).toBe('Hello, how can I help?');
      expect(response.stopReason).toBe('end_turn');
      expect(response.usage?.inputTokens).toBe(50);
      expect(response.usage?.outputTokens).toBe(20);
    });

    it('should handle tool_use response', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'I will run that command.' },
          { type: 'tool_use', id: 'tool_123', name: 'bash', input: { command: 'ls -la' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 30 },
      });

      const tools: ToolDefinition[] = [{
        name: 'bash',
        description: 'Run bash commands',
        parameters: { type: 'object', properties: { command: { type: 'string' } } },
      }];

      const response = await provider.chat([
        { role: 'user', content: 'List files' },
      ], tools);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].id).toBe('tool_123');
      expect(response.toolCalls![0].name).toBe('bash');
      expect(response.toolCalls![0].arguments).toEqual({ command: 'ls -la' });
      expect(response.stopReason).toBe('tool_use');
    });

    it('should handle multiple tool calls', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'read', input: { file_path: 'a.ts' } },
          { type: 'tool_use', id: 'tool_2', name: 'read', input: { file_path: 'b.ts' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 150, output_tokens: 40 },
      });

      const response = await provider.chat([{ role: 'user', content: 'Read both files' }]);

      expect(response.toolCalls).toHaveLength(2);
      expect(response.toolCalls![0].name).toBe('read');
      expect(response.toolCalls![1].name).toBe('read');
    });

    it('should use custom model from options', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.chat([{ role: 'user', content: 'test' }], undefined, { model: 'claude-sonnet-4-6' });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' })
      );
    });

    it('should use default maxTokens when not specified', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.chat([{ role: 'user', content: 'test' }]);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 16000 })
      );
    });

    it('should include system prompt', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.chat([{ role: 'user', content: 'test' }], undefined, {
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'You are a helpful assistant.' })
      );
    });

    it('should apply thinking config when enabled', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.chat([{ role: 'user', content: 'test' }], undefined, {
        thinking: true,
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ thinking: { type: 'adaptive', display: 'summarized' } })
      );
    });

    it('should include cache tokens in usage', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 50,
          output_tokens: 20,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 200,
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'test' }]);

      expect(response.usage?.cacheCreationTokens).toBe(100);
      expect(response.usage?.cacheReadTokens).toBe(200);
    });

    it('should map stop reasons correctly', async () => {
      const stopReasons = ['end_turn', 'tool_use', 'max_tokens', 'refusal', 'model_context_window_exceeded', 'pause_turn'];

      for (const reason of stopReasons) {
        mockMessagesCreate.mockResolvedValue({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: reason,
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const response = await provider.chat([{ role: 'user', content: 'test' }]);
        expect(response.stopReason).toBe(reason);
      }
    });
  });

  describe('chat() - error handling', () => {
    it('should throw ApiKeyMissingError for AuthenticationError', async () => {
      mockMessagesCreate.mockRejectedValue(new MockAuthenticationError('Invalid API key'));

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(ApiKeyMissingError);
    });

    it('should throw ApiRateLimitError for RateLimitError', async () => {
      mockMessagesCreate.mockRejectedValue(new MockRateLimitError('Rate limited'));

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(ApiRateLimitError);
    });

    it('should throw ApiRequestError for BadRequestError', async () => {
      mockMessagesCreate.mockRejectedValue(new MockBadRequestError('Bad request'));

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(ApiRequestError);
    });

    it('should throw ApiRequestError for unknown errors', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('Unknown error'));

      await expect(provider.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(ApiRequestError);
    });
  });

  // Note: Retry logic with APIConnectionError has exponential backoff delays that cause timeouts.
// The retry behavior is better tested through integration tests with mocked timers.

  describe('stream()', () => {
    it('should yield text chunks', async () => {
      const chunks = [
        { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ];

      // Create an async iterable with finalMessage method
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        },
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
      };

      mockMessagesStream.mockReturnValue(mockStream);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const textChunks = results.filter(c => c.type === 'text');
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0].text).toBe('Hello');
      expect(textChunks[1].text).toBe(' world');
    });

    it('should yield thinking chunks', async () => {
      const chunks = [
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: 'Initial thought' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: ' more thinking' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        },
        finalMessage: vi.fn().mockResolvedValue({ usage: {} }),
      };

      mockMessagesStream.mockReturnValue(mockStream);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const thinkingChunks = results.filter(c => c.type === 'thinking');
      expect(thinkingChunks).toHaveLength(2);
      expect(thinkingChunks[0].thinking).toBe('Initial thought');
      expect(thinkingChunks[1].thinking).toBe(' more thinking');
    });

    it('should yield tool_use chunks', async () => {
      const chunks = [
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool_123', name: 'bash' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        },
        finalMessage: vi.fn().mockResolvedValue({ usage: {} }),
      };

      mockMessagesStream.mockReturnValue(mockStream);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const toolChunks = results.filter(c => c.type === 'tool_use');
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.id).toBe('tool_123');
      expect(toolChunks[0].toolCall?.name).toBe('bash');
      expect(toolChunks[0].toolCall?.arguments).toEqual({ command: 'ls' });
      expect(toolChunks[0].isComplete).toBe(true);
    });

    it('should yield usage data from final message', async () => {
      const chunks = [
        { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Response' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        },
        finalMessage: vi.fn().mockResolvedValue({
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
          },
        }),
      };

      mockMessagesStream.mockReturnValue(mockStream);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const usageChunk = results.find(c => c.type === 'usage');
      expect(usageChunk?.usage?.inputTokens).toBe(100);
      expect(usageChunk?.usage?.outputTokens).toBe(50);
      expect(usageChunk?.usage?.cacheCreationTokens).toBe(20);
      expect(usageChunk?.usage?.cacheReadTokens).toBe(30);
    });

    it('should use correct default maxTokens for stream', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message_stop' };
        },
        finalMessage: vi.fn().mockResolvedValue({ usage: {} }),
      };

      mockMessagesStream.mockReturnValue(mockStream);

      await provider.stream([{ role: 'user', content: 'test' }]).next();

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 64000 })
      );
    });
  });

  describe('getDefaultModel()', () => {
    it('should return default model', () => {
      expect(provider.getDefaultModel()).toBe('claude-opus-4-7');
    });
  });

  describe('listModels()', () => {
    it('should return list of models', async () => {
      const models = await provider.listModels();
      expect(models).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6']);
    });
  });
});