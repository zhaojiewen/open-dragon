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
import { ChineseProvider, CHINESE_PROVIDERS } from '../../../src/providers/chinese.js';

describe('ChineseProvider Streaming', () => {
  let provider: ChineseProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ChineseProvider({
      name: 'qwen',
      apiKey: 'sk-qwen-test-key',
      models: ['qwen-max', 'qwen-plus'],
      defaultModel: 'qwen-max',
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
            choices: [{ delta: { content: '你好' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: '，我是' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: '通义千问' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      expect(chunks.filter(c => c.type === 'text')).toHaveLength(3);
      expect(chunks.find(c => c.type === 'text' && c.text === '你好')).toBeDefined();
      expect(chunks.find(c => c.type === 'text' && c.text === '通义千问')).toBeDefined();
    });

    it('should yield usage data at stream end', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: '测试响应' } }],
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
                  id: 'qwen_call_1',
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
                  function: { arguments: '{"command":"npm run build"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 40, completion_tokens: 15 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.id).toBe('qwen_call_1');
      expect(toolChunks[0].toolCall?.name).toBe('bash');
      expect(toolChunks[0].toolCall?.arguments).toEqual({ command: 'npm run build' });
    });

    it('should handle multiple tool calls in sequence', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          // Tool 1: glob to find files
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_find',
                  function: { name: 'glob' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"pattern":"**/*.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          // Tool 2: grep to search
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_search',
                  function: { name: 'grep' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"pattern":"import","path":"src"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 60, completion_tokens: 25 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0].toolCall?.name).toBe('glob');
      expect(toolChunks[1].toolCall?.name).toBe('grep');
    });

    it('should handle tool call with complex nested arguments', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'call_complex',
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
                  function: { arguments: '{"file_path":"/src/config.ts","content":"export const config = {\\n  name: \\\"dragon\\\",\\n  version: \\\"1.0\\\"\\n};"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 80, completion_tokens: 30 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.arguments).toHaveProperty('file_path');
      expect(toolChunks[0].toolCall?.arguments).toHaveProperty('content');
    });
  });

  describe('stream() - user scenario: Chinese developer workflow', () => {
    it('should simulate Chinese developer asking to analyze project', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: '我来帮你分析' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: '这个项目。' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'analyze_1',
                  function: { name: 'glob' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  function: { arguments: '{"pattern":"src/**/*.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 200, completion_tokens: 40 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([
        { role: 'user', content: '帮我分析这个项目的源代码结构' },
      ])) {
        chunks.push(chunk);
      }

      // Verify Chinese text response
      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.some(c => c.text?.includes('分析'))).toBe(true);

      // Verify tool usage
      const toolChunks = chunks.filter(c => c.type === 'tool_use');
      expect(toolChunks.length).toBeGreaterThan(0);

      // Verify usage
      const usageChunk = chunks.find(c => c.type === 'usage');
      expect(usageChunk?.usage?.inputTokens).toBe(200);
    });

    it('should simulate bug fixing workflow', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: '让我检查这个错误' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'bug_read',
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
                  function: { arguments: '{"file_path":"src/providers/chinese.ts"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'bug_edit',
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
                  function: { arguments: '{"file_path":"src/providers/chinese.ts","old_string":"stream()","new_string":"async *stream()"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 300, completion_tokens: 50 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([
        { role: 'user', content: 'stream 方法有个 bug，帮我修复' },
      ])) {
        chunks.push(chunk);
      }

      // Should have multiple tool calls for read then edit
      const toolChunks = chunks.filter(c => c.type === 'tool_use' && c.isComplete);
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0].toolCall?.name).toBe('read');
      expect(toolChunks[1].toolCall?.name).toBe('edit');
    });
  });

  describe('stream() - mixed content scenario', () => {
    it('should handle text then tool call then more text', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{ delta: { content: '首先' } }],
            usage: null,
          };
          yield {
            choices: [{ delta: { content: '让我看看文件内容。' } }],
            usage: null,
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'mixed_call',
                  function: { name: 'read', arguments: '{"file_path":"README.md"}' },
                }],
              },
            }],
            usage: null,
          };
          yield {
            choices: [{ delta: {} }],
            usage: { prompt_tokens: 150, completion_tokens: 35 },
          };
        })()
      );

      const chunks = [];
      for await (const chunk of provider.stream([])) {
        chunks.push(chunk);
      }

      // Should have both text and tool_use chunks
      expect(chunks.filter(c => c.type === 'text').length).toBeGreaterThan(0);
      expect(chunks.filter(c => c.type === 'tool_use').length).toBeGreaterThan(0);
      expect(chunks.find(c => c.type === 'usage')).toBeDefined();
    });
  });

  describe('stream() - malformed JSON handling', () => {
    it('should handle malformed tool arguments gracefully', async () => {
      mockStreamCreate.mockResolvedValue(
        (async function* () {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  id: 'malformed_call',
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
                  function: { arguments: '{invalid json}' },
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
      // Should fallback to empty object
      expect(toolChunks[0].toolCall?.arguments).toEqual({});
    });
  });
});

describe('ChineseProvider - different Chinese providers', () => {
  it('should use qwen base URL', () => {
    const qwenProvider = new ChineseProvider({
      name: 'qwen',
      apiKey: 'test-key',
    });
    expect(qwenProvider['baseUrl']).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('should use moonshot base URL', () => {
    const moonshotProvider = new ChineseProvider({
      name: 'moonshot',
      apiKey: 'test-key',
    });
    expect(moonshotProvider['baseUrl']).toBe('https://api.moonshot.cn/v1');
  });

  it('should use yi base URL', () => {
    const yiProvider = new ChineseProvider({
      name: 'yi',
      apiKey: 'test-key',
    });
    expect(yiProvider['baseUrl']).toBe('https://api.lingyiwanwu.com/v1');
  });

  it('should use doubao base URL', () => {
    const doubaoProvider = new ChineseProvider({
      name: 'doubao',
      apiKey: 'test-key',
    });
    expect(doubaoProvider['baseUrl']).toBe('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('should support custom base URL', () => {
    const customProvider = new ChineseProvider({
      name: 'custom-ai',
      apiKey: 'test-key',
      baseUrl: 'https://custom.ai.com/v1',
    });
    expect(customProvider['baseUrl']).toBe('https://custom.ai.com/v1');
  });
});

describe('CHINESE_PROVIDERS config', () => {
  it('should have predefined providers', () => {
    expect(CHINESE_PROVIDERS.qwen).toBeDefined();
    expect(CHINESE_PROVIDERS.moonshot).toBeDefined();
    expect(CHINESE_PROVIDERS.yi).toBeDefined();
    expect(CHINESE_PROVIDERS.doubao).toBeDefined();
  });

  it('should have default models for predefined providers', () => {
    expect(CHINESE_PROVIDERS.qwen.models).toContain('qwen-max');
    expect(CHINESE_PROVIDERS.moonshot.models).toContain('moonshot-v1-8k');
  });
});