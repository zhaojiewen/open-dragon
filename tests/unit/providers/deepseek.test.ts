import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStreamCreate = vi.fn();

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
import { DeepSeekProvider } from '../../../src/providers/deepseek.js';

describe('DeepSeekProvider Streaming', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DeepSeekProvider({
      apiKey: 'sk-deepseek-test',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stream() - text streaming', () => {
    it('should yield text chunks from stream', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'DeepSeek' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: ' response' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 15, completion_tokens: 8 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      expect(chunks.filter(c => c.type === 'text')).toHaveLength(2);
      expect(chunks.find(c => c.type === 'text' && c.text === 'DeepSeek')).toBeDefined();
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
            usage: { prompt_tokens: 200, completion_tokens: 100 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const usageChunk = chunks.find(c => c.type === 'usage');
      expect(usageChunk).toBeDefined();
      expect(usageChunk?.usage?.inputTokens).toBe(200);
      expect(usageChunk?.usage?.outputTokens).toBe(100);
    });

    it('should use correct base URL', () => {
      expect(provider['baseUrl']).toBe('https://api.deepseek.com/v1');
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
                  id: 'ds_call_1',
                  function: { name: 'write' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"file_path":"output.txt","content":"Hello"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 30, completion_tokens: 10 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.id).toBe('ds_call_1');
      expect(toolChunks[0].toolCall?.name).toBe('write');
      expect(toolChunks[0].toolCall?.arguments).toEqual({
        file_path: 'output.txt',
        content: 'Hello',
      });
    });

    it('should handle multiple sequential tool calls', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          // First tool - read
          yield {
            choices: [{
              delta: {
                tool_calls: [{ id: 'call_a', function: { name: 'read' } }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{ function: { arguments: '{"file_path":"a.ts"}' } }],
              },
            }],
            usage: null,
          };
          // Second tool - read another file
          yield {
            choices: [{
              delta: {
                tool_calls: [{ id: 'call_b', function: { name: 'read' } }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{ function: { arguments: '{"file_path":"b.ts"}' } }],
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
      expect(toolChunks).toHaveLength(2);
    });
  });

  describe('stream() - user scenario: code review request', () => {
    it('should simulate code review workflow', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'I will review ' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: 'your code.' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'review_call',
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
                  function: { arguments: '{"file_path":"/src/index.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 150, completion_tokens: 25 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([
        { role: 'user', content: 'Review my code at /src/index.ts' },
      ])) {
        chunks.push(chunk);
      }

      // Verify text response
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);

      // Verify tool call for reading file
      const toolChunks = chunks.filter(c => c.type === 'tool_use');
      expect(toolChunks.length).toBeGreaterThan(0);
      expect(toolChunks[0].toolCall?.name).toBe('read');

      // Verify usage tracking
      const usageChunk = chunks.find(c => c.type === 'usage');
      expect(usageChunk?.usage?.inputTokens).toBe(150);
    });
  });

  describe('stream() - user scenario: refactoring', () => {
    it('should simulate refactoring workflow with multiple tools', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: 'Let me refactor this.' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'refactor_read',
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
                  function: { arguments: '{"file_path":"src/handlers.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'refactor_edit',
                  function: { name: 'edit' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"file_path":"src/handlers.ts","old_string":"function oldHandler()","new_string":"const newHandler = ()"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: 'Done!' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 250, completion_tokens: 45 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([
        { role: 'user', content: 'Refactor handlers.ts to use arrow functions' },
      ])) {
        chunks.push(chunk);
      }

      // Should have read + edit tool calls
      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0].toolCall?.name).toBe('read');
      expect(toolChunks[1].toolCall?.name).toBe('edit');

      // Should have text at start and end
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);

      // Should have usage
      expect(chunks.find(c => c.type === 'usage')).toBeDefined();
    });
  });
});