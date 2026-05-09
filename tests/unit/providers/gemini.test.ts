import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message, ToolDefinition, ChatOptions, StreamChunk } from '../../../src/providers/base.js';

// Mock functions
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn();

// Mock Google Generative AI SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      getGenerativeModel = mockGetGenerativeModel;
    },
  };
});

// Import after mocking
import { GeminiProvider } from '../../../src/providers/gemini.js';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    });
    provider = new GeminiProvider({
      apiKey: 'test-gemini-key',
      models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-1.5-pro',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default models when not provided', () => {
      const defaultProvider = new GeminiProvider({ apiKey: 'test-key' });
      expect(defaultProvider.getDefaultModel()).toBe('gemini-1.5-pro');
    });

    it('should use custom models when provided', () => {
      expect(provider.getDefaultModel()).toBe('gemini-1.5-pro');
      expect(provider.listModels()).resolves.toEqual(['gemini-1.5-pro', 'gemini-1.5-flash']);
    });

    it('should accept custom baseUrl', () => {
      const customProvider = new GeminiProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.gemini.com',
      });
      expect(customProvider['baseUrl']).toBe('https://custom.gemini.com');
    });
  });

  describe('chat()', () => {
    it('should return text response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: { parts: [{ text: 'Hello from Gemini!' }] },
          }],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 },
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(response.content).toBe('Hello from Gemini!');
      expect(response.stopReason).toBe('end_turn');
      expect(response.usage?.inputTokens).toBe(50);
      expect(response.usage?.outputTokens).toBe(20);
    });

    it('should handle tool_use response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'I will run that command.' },
                { functionCall: { name: 'bash', args: { command: 'ls -la' } } },
              ],
            },
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30 },
        },
      });

      const tools: ToolDefinition[] = [{
        name: 'bash',
        description: 'Run bash commands',
        parameters: { type: 'object', properties: { command: { type: 'string' } } },
      }];

      const response = await provider.chat([{ role: 'user', content: 'List files' }], tools);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].id).toBe('bash');
      expect(response.toolCalls![0].name).toBe('bash');
      expect(response.toolCalls![0].arguments).toEqual({ command: 'ls -la' });
    });

    it('should handle multiple tool calls', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [
                { functionCall: { name: 'read', args: { file_path: 'a.ts' } } },
                { functionCall: { name: 'read', args: { file_path: 'b.ts' } } },
              ],
            },
          }],
          usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 40 },
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'Read both files' }]);

      expect(response.toolCalls).toHaveLength(2);
      expect(response.toolCalls![0].name).toBe('read');
      expect(response.toolCalls![1].name).toBe('read');
    });

    it('should use custom model from options', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      await provider.chat([{ role: 'user', content: 'test' }], undefined, { model: 'gemini-1.5-flash' });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-flash' });
    });

    it('should include system instruction', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      await provider.chat([{ role: 'user', content: 'test' }], undefined, {
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ systemInstruction: 'You are a helpful assistant.' })
      );
    });

    it('should pass tools to generateContent', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const tools: ToolDefinition[] = [{
        name: 'bash',
        description: 'Run commands',
        parameters: { type: 'object', properties: { command: { type: 'string' } } },
      }];

      await provider.chat([{ role: 'user', content: 'test' }], tools);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [{
            functionDeclarations: [{
              name: 'bash',
              description: 'Run commands',
              parameters: { type: 'object', properties: { command: { type: 'string' } } },
            }],
          }],
        })
      );
    });

    it('should handle empty response gracefully', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'test' }]);

      expect(response.content).toBe('');
      expect(response.usage?.inputTokens).toBe(10);
      expect(response.usage?.outputTokens).toBe(0);
    });

    it('should handle response without parts gracefully', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: {} }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'test' }]);

      expect(response.content).toBe('');
    });

    it('should handle response without usageMetadata gracefully', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        },
      });

      const response = await provider.chat([{ role: 'user', content: 'test' }]);

      expect(response.content).toBe('Response');
      expect(response.usage?.inputTokens).toBe(0);
      expect(response.usage?.outputTokens).toBe(0);
    });
  });

  describe('chat() - message formatting', () => {
    it('should format user messages correctly', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: {},
        },
      });

      await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        })
      );
    });

    it('should format assistant messages as model role', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: {},
        },
      });

      await provider.chat([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there' }] },
            { role: 'user', parts: [{ text: 'How are you?' }] },
          ],
        })
      );
    });

    it('should extract system messages', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: {},
        },
      });

      await provider.chat([
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ systemInstruction: 'System instruction' })
      );
    });

    it('should handle content blocks in user messages', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: {},
        },
      });

      await provider.chat([{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: '' }] }],
        })
      );
    });
  });

  describe('stream()', () => {
    it('should yield text chunks', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
          yield { candidates: [{ content: { parts: [{ text: ' from Gemini!' }] } }] };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const textChunks = results.filter(c => c.type === 'text');
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0].text).toBe('Hello');
      expect(textChunks[1].text).toBe(' from Gemini!');
    });

    it('should yield tool_use chunks', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield {
            candidates: [{
              content: {
                parts: [{ functionCall: { name: 'bash', args: { command: 'ls' } } }],
              },
            }],
          };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const toolChunks = results.filter(c => c.type === 'tool_use');
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].toolCall?.id).toBe('bash');
      expect(toolChunks[0].toolCall?.name).toBe('bash');
      expect(toolChunks[0].toolCall?.arguments).toEqual({ command: 'ls' });
      expect(toolChunks[0].isComplete).toBe(true);
    });

    it('should handle multiple tool calls in stream', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield {
            candidates: [{
              content: {
                parts: [
                  { functionCall: { name: 'read', args: { file_path: 'a.ts' } } },
                  { functionCall: { name: 'read', args: { file_path: 'b.ts' } } },
                ],
              },
            }],
          };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      const toolChunks = results.filter(c => c.type === 'tool_use');
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0].toolCall?.name).toBe('read');
      expect(toolChunks[1].toolCall?.name).toBe('read');
    });

    it('should handle empty stream gracefully', async () => {
      const mockStreamResult = {
        stream: async function* () {
          // No chunks
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    it('should handle chunks without candidates gracefully', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [] };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    it('should use custom model from options', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'Response' }] } }] };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      await provider.stream([{ role: 'user', content: 'test' }], undefined, { model: 'gemini-1.5-flash' }).next();

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-flash' });
    });

    it('should pass tools to stream', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'Response' }] } }] };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const tools: ToolDefinition[] = [{
        name: 'bash',
        description: 'Run commands',
        parameters: { type: 'object', properties: {} },
      }];

      await provider.stream([{ role: 'user', content: 'test' }], tools).next();

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [{
            functionDeclarations: [{
              name: 'bash',
              description: 'Run commands',
              parameters: { type: 'object', properties: {} },
            }],
          }],
        })
      );
    });

    it('should include system instruction in stream', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'Response' }] } }] };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      await provider.stream([{ role: 'user', content: 'test' }], undefined, {
        systemPrompt: 'You are a helpful assistant.',
      }).next();

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ systemInstruction: 'You are a helpful assistant.' })
      );
    });
  });

  describe('stream() - combined scenarios', () => {
    it('should yield mixed text and tool_use', async () => {
      const mockStreamResult = {
        stream: async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'I will help.' }] } }] };
          yield {
            candidates: [{
              content: { parts: [{ functionCall: { name: 'bash', args: { command: 'ls' } } }] },
            }],
          };
        },
      };

      mockGenerateContentStream.mockResolvedValue(mockStreamResult);

      const results: StreamChunk[] = [];
      for await (const chunk of provider.stream([{ role: 'user', content: 'test' }])) {
        results.push(chunk);
      }

      expect(results.filter(c => c.type === 'text')).toHaveLength(1);
      expect(results.filter(c => c.type === 'tool_use')).toHaveLength(1);
    });
  });

  describe('getDefaultModel()', () => {
    it('should return default model', () => {
      expect(provider.getDefaultModel()).toBe('gemini-1.5-pro');
    });
  });

  describe('listModels()', () => {
    it('should return list of models', async () => {
      const models = await provider.listModels();
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-1.5-flash']);
    });
  });
});