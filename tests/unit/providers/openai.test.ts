import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStreamCreate = vi.fn();

// Mock OpenAI as a class constructor
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockStreamCreate,
        },
      };
    },
  };
});

// Import after mocking
import { OpenAIProvider } from '../../../src/providers/openai.js';

describe('OpenAIProvider Streaming', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
      models: ['gpt-4o', 'gpt-4-turbo'],
      defaultModel: 'gpt-4o',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stream() - text streaming', () => {
    it('should yield text chunks from stream', async () => {
      // Simulate stream chunks
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'Hello' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: ' world' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      expect(chunks.filter(c => c.type === 'text')).toHaveLength(2);
      expect(chunks.find(c => c.type === 'text' && c.text === 'Hello')).toBeDefined();
      expect(chunks.find(c => c.type === 'text' && c.text === ' world')).toBeDefined();
    });

    it('should yield usage data at stream end', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'Test' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const usageChunk = chunks.find(c => c.type === 'usage');
      expect(usageChunk).toBeDefined();
      expect(usageChunk?.usage?.inputTokens).toBe(100);
      expect(usageChunk?.usage?.outputTokens).toBe(50);
    });

    it('should request stream_options for usage data', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield { choices: [{ delta: {} }], usage: null };
        })()
      );

      await provider.stream([]).next();

      expect(mockStreamCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream_options: { include_usage: true },
        })
      );
    });
  });

  describe('stream() - tool calls', () => {
    it('should yield complete tool call from streaming delta', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_123',
                  function: { name: 'bash' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"command":' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '"ls -la"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 50, completion_tokens: 20 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.id).toBe('call_123');
      expect(toolChunks[0].toolCall?.name).toBe('bash');
      expect(toolChunks[0].toolCall?.arguments).toEqual({ command: 'ls -la' });
    });

    it('should handle multiple tool calls in stream', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          // First tool call
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_1',
                  function: { name: 'read' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"file_path":"test.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          // Second tool call starts
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_2',
                  function: { name: 'bash' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"command":"npm test"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 100, completion_tokens: 30 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0].toolCall?.name).toBe('read');
      expect(toolChunks[1].toolCall?.name).toBe('bash');
    });

    it('should handle malformed JSON arguments gracefully', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_bad',
                  function: { name: 'test_tool' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: 'not valid json' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: null,
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(1);
      // Should fallback to empty object when JSON parse fails
      expect(toolChunks[0].toolCall?.arguments).toEqual({});
    });
  });

  describe('stream() - mixed content', () => {
    it('should handle text followed by tool calls', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'Let me help you' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: ' with that.' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_1',
                  function: { name: 'bash', arguments: '{"command":"pwd"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 20, completion_tokens: 15 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      expect(chunks.filter(c => c.type === 'text')).toHaveLength(2);
      expect(chunks.filter(c => c.type === 'tool_use')).toHaveLength(1);
      expect(chunks.find(c => c.type === 'usage')).toBeDefined();
    });
  });

  describe('stream() - user scenario: debugging workflow', () => {
    it('should simulate user asking to debug an error', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'I see the error. ' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: 'Let me check the file.' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'debug_read',
                  function: { name: 'read' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"file_path":"/src/utils/error.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 200, completion_tokens: 35 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([
        { role: 'user', content: 'There is an error in error.ts, line 42' },
      ])) {
        chunks.push(chunk);
      }

      // Should have text explaining the action
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);

      // Should have tool call for reading the file
      const toolChunks = chunks.filter(c => c.type === 'tool_use');
      expect(toolChunks.length).toBeGreaterThan(0);
      expect(toolChunks[0].toolCall?.name).toBe('read');

      // Should have usage data
      const usageChunk = chunks.find(c => c.type === 'usage');
      expect(usageChunk?.usage?.inputTokens).toBe(200);
    });
  });
});