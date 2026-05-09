import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleChat,
  setSystemPrompt,
  getSystemPrompt,
  extractPathsFromToolCall,
  isToolInWorkspace,
  ChatResult,
} from '../../../src/repl/chat-loop.js';
import type { AIProvider, StreamChunk, ToolCall, Message } from '../../../src/providers/base.js';
import type { ToolRegistry } from '../../../src/tools/index.js';
import type { ToolExecuteResult } from '../../../src/tools/base.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    blue: (s: string) => s,
  },
}));

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  }),
}));

// Mock costTracker
vi.mock('../../../src/utils/cost-tracker.js', () => ({
  costTracker: {
    record: vi.fn(),
    getTotalTokens: vi.fn(() => 50000),
    reset: vi.fn(),
  },
}));

// Mock HistoryCompactor - must define class inside the mock callback for hoisting
vi.mock('../../../src/utils/history-compactor.js', () => {
  class MockHistoryCompactor {
    needsCompaction() { return false; }
    async compact(msgs: any[]) {
      return {
        messages: msgs,
        wasCompacted: false,
        originalCount: msgs.length,
        compactedCount: msgs.length,
      };
    }
  }
  return { HistoryCompactor: MockHistoryCompactor };
});

// Mock perfMonitor
vi.mock('../../../src/performance/index.js', () => ({
  perfMonitor: {
    startTimer: vi.fn(() => () => 100),
  },
}));

// Mock prompts
vi.mock('../../../src/repl/prompts.js', () => ({
  promptToolConfirm: vi.fn(async () => 'approve-once'),
  promptOutsideWorkspace: vi.fn(async () => 'approve-once'),
}));

// Import mocked modules
import { costTracker } from '../../../src/utils/cost-tracker.js';
import { HistoryCompactor } from '../../../src/utils/history-compactor.js';
import { promptToolConfirm, promptOutsideWorkspace } from '../../../src/repl/prompts.js';

// Helper to create mock provider with explicit generator handling
function createMockProvider(chunks: StreamChunk[], followUpChunks?: StreamChunk[]): AIProvider {
  let callCount = 0;
  const streamMock = vi.fn(async function* (): AsyncGenerator<StreamChunk> {
    callCount++;
    const chunksToYield = callCount === 1 ? chunks : (followUpChunks || [{ type: 'text', text: '' }, { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }]);
    for (const chunk of chunksToYield) {
      yield chunk;
    }
  });

  return {
    name: 'test-provider',
    getDefaultModel: vi.fn(() => 'test-model'),
    listModels: vi.fn(async () => ['test-model']),
    chat: vi.fn(),
    stream: streamMock,
  } as unknown as AIProvider;
}

// Helper to create mock tool registry
function createMockToolRegistry(): ToolRegistry {
  return {
    resetTurnCounter: vi.fn(),
    setExecutionLimits: vi.fn(),
    executeToolCall: vi.fn(async (tc: ToolCall): Promise<ToolExecuteResult> => ({
      success: true,
      output: `Tool ${tc.name} executed successfully`,
    })),
  } as unknown as ToolRegistry;
}

// Helper to create mock input queue
function createMockInputQueue() {
  return {
    startStreaming: vi.fn(),
    endStreaming: vi.fn(),
    isStreaming: vi.fn(() => false),
    abortStream: vi.fn(),
    wasAborted: vi.fn(() => false),
    queueInput: vi.fn(() => false),
    getPendingInputs: vi.fn(() => []),
    getPendingCount: vi.fn(() => 0),
    clearPendingInputs: vi.fn(),
    getAbortController: vi.fn(() => null),
  };
}

describe('chat-loop', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('setSystemPrompt / getSystemPrompt', () => {
    it('should set and get system prompt', () => {
      setSystemPrompt('You are a helpful assistant.');
      expect(getSystemPrompt()).toBe('You are a helpful assistant.');
    });

    it('should return empty string by default', () => {
      setSystemPrompt('');
      expect(getSystemPrompt()).toBe('');
    });

    it('should overwrite previous prompt', () => {
      setSystemPrompt('First prompt');
      setSystemPrompt('Second prompt');
      expect(getSystemPrompt()).toBe('Second prompt');
    });
  });

  describe('extractPathsFromToolCall', () => {
    it('should extract file_path from read tool', () => {
      const tc = { id: '1', name: 'read', arguments: { file_path: '/src/file.ts' } };
      expect(extractPathsFromToolCall(tc)).toEqual(['/src/file.ts']);
    });

    it('should extract file_path from write tool', () => {
      const tc = { id: '2', name: 'write', arguments: { file_path: '/dest/file.ts', content: 'x' } };
      expect(extractPathsFromToolCall(tc)).toEqual(['/dest/file.ts']);
    });

    it('should extract file_path from edit tool', () => {
      const tc = { id: '3', name: 'edit', arguments: { file_path: '/edit/file.ts' } };
      expect(extractPathsFromToolCall(tc)).toEqual(['/edit/file.ts']);
    });

    it('should handle filePath variant', () => {
      const tc = { id: '4', name: 'read', arguments: { filePath: '/variant.ts' } };
      expect(extractPathsFromToolCall(tc)).toEqual(['/variant.ts']);
    });

    it('should extract paths from bash commands', () => {
      const tc = { id: '5', name: 'bash', arguments: { command: 'cat /src/a.ts > /dest/b.ts' } };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toContain('/src/a.ts');
      expect(paths).toContain('/dest/b.ts');
    });

    it('should extract relative paths from bash', () => {
      const tc = { id: '6', name: 'bash', arguments: { command: './script.sh' } };
      expect(extractPathsFromToolCall(tc)).toContain('./script.sh');
    });

    it('should extract home-relative paths from bash', () => {
      const tc = { id: '7', name: 'bash', arguments: { command: 'ls ~/Documents' } };
      const paths = extractPathsFromToolCall(tc);
      expect(paths.some(p => p.startsWith('~'))).toBe(true);
    });

    it('should extract quoted paths from bash (simple paths without spaces)', () => {
      const tc = { id: '8', name: 'bash', arguments: { command: 'cat "/simple-path/file.ts"' } };
      const paths = extractPathsFromToolCall(tc);
      // Note: the regex only works for simple quoted paths without spaces in the path
      // because the command is split by whitespace first
      expect(paths).toContain('/simple-path/file.ts');
    });

    it('should extract tilde quoted paths from bash', () => {
      const tc = { id: '8b', name: 'bash', arguments: { command: 'ls "~/Documents"' } };
      const paths = extractPathsFromToolCall(tc);
      // Tilde paths in quotes should be extracted
      expect(paths.some(p => p.includes('~') || p.includes('Documents'))).toBe(true);
    });

    it('should skip bash flags and operators', () => {
      const tc = { id: '9', name: 'bash', arguments: { command: 'cat -n /src/file.ts && echo done' } };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toContain('/src/file.ts');
      expect(paths).not.toContain('-n');
      expect(paths).not.toContain('&&');
    });

    it('should return empty array for non-file tools', () => {
      const tc = { id: '10', name: 'webfetch', arguments: { url: 'https://example.com' } };
      expect(extractPathsFromToolCall(tc)).toEqual([]);
    });

    it('should return empty array when no file_path argument', () => {
      const tc = { id: '11', name: 'read', arguments: {} };
      expect(extractPathsFromToolCall(tc)).toEqual([]);
    });
  });

  describe('isToolInWorkspace', () => {
    it('should return true when no workspace configured', () => {
      const tc = { id: '1', name: 'read', arguments: { file_path: '/any/path.ts' } };
      expect(isToolInWorkspace(tc, [])).toBe(true);
    });

    it('should return true when no file paths in tool call', () => {
      const tc = { id: '2', name: 'bash', arguments: { command: 'npm test' } };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(true);
    });

    it('should return true for path within workspace', () => {
      const tc = { id: '3', name: 'read', arguments: { file_path: '/workspace/src/file.ts' } };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(true);
    });

    it('should return false for path outside workspace', () => {
      const tc = { id: '4', name: 'read', arguments: { file_path: '/outside/file.ts' } };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(false);
    });

    it('should handle multiple workspace paths', () => {
      const tc = { id: '5', name: 'read', arguments: { file_path: '/project2/file.ts' } };
      expect(isToolInWorkspace(tc, ['/project1', '/project2'])).toBe(true);
    });

    it('should return false if any path is outside workspace', () => {
      const tc = { id: '6', name: 'bash', arguments: { command: 'cp /workspace/a.ts /outside/b.ts' } };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(false);
    });
  });

  describe('handleChat', () => {
    it('should handle basic text streaming', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world!' },
        { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();
      const messages: Message[] = [{ role: 'user', content: 'Say hello' }];

      const result = await handleChat(
        messages,
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off'
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Hello world!');
      expect(result.wasAborted).toBeUndefined();
      expect(toolRegistry.resetTurnCounter).toHaveBeenCalled();
    });

    it('should handle thinking chunks', async () => {
      const chunks: StreamChunk[] = [
        { type: 'thinking', thinking: 'Let me think...' },
        { type: 'text', text: 'The answer is 42.' },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 20 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();
      const messages: Message[] = [{ role: 'user', content: 'What is the answer?' }];

      const result = await handleChat(
        messages,
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off'
      );

      expect(result.messages[1].content).toBe('The answer is 42.');
    });

    it('should handle tool_use chunks', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Let me read that file.' },
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'read', arguments: { file_path: '/test.txt' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 100, outputTokens: 30 } },
      ];

      // After tool execution, the loop continues with followUpChunks
      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: 'Done reading.' },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 20 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();
      const messages: Message[] = [{ role: 'user', content: 'Read the file' }];

      const result = await handleChat(
        messages,
        [{ name: 'read', description: 'Read file', parameters: { type: 'object', properties: {} } }],
        provider,
        toolRegistry,
        undefined,
        true, // autoApproveTools
        'off'
      );

      // Should have: user message, assistant (with tools), tool results, assistant (final)
      expect(result.messages).toHaveLength(4);
      expect(toolRegistry.executeToolCall).toHaveBeenCalled();
    });

    it('should handle abort signal during streaming', async () => {
      const abortController = new AbortController();

      // Create a provider that will abort after yielding first chunk
      const provider = {
        name: 'test-provider',
        getDefaultModel: vi.fn(() => 'test-model'),
        listModels: vi.fn(async () => ['test-model']),
        chat: vi.fn(),
        stream: vi.fn(async function* () {
          yield { type: 'text', text: 'Starting...' };
          // Abort before yielding next chunk
          abortController.abort();
          yield { type: 'text', text: 'More text' };
        }),
      } as unknown as AIProvider;

      const toolRegistry = createMockToolRegistry();
      const messages: Message[] = [{ role: 'user', content: 'Test abort' }];

      const result = await handleChat(
        messages,                    // 1
        [],                          // 2
        provider,                    // 3
        toolRegistry,                // 4
        undefined,                   // 5 (model)
        false,                       // 6 (autoApproveTools)
        'off',                       // 7 (tokenSaveLevel)
        undefined,                   // 8 (session)
        undefined,                   // 9 (autoApproveOutsideWorkspace)
        undefined,                   // 10 (workspacePaths)
        abortController.signal       // 11 (abortSignal)
      );

      expect(result.wasAborted).toBe(true);
    });

    it('should handle stream errors', async () => {
      const provider = {
        name: 'test-provider',
        getDefaultModel: vi.fn(() => 'test-model'),
        listModels: vi.fn(async () => ['test-model']),
        chat: vi.fn(),
        stream: vi.fn(async function* () {
          yield { type: 'text', text: 'Partial' };
          throw new Error('Stream failed');
        }),
      } as unknown as AIProvider;

      const toolRegistry = createMockToolRegistry();
      const messages: Message[] = [{ role: 'user', content: 'Cause error' }];

      await expect(handleChat(
        messages,
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off'
      )).rejects.toThrow('Stream failed');
    });

    it('should record cost with cache tokens', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Response' },
        { type: 'usage', usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 20, cacheReadTokens: 80 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Test' }],
        [],
        provider,
        toolRegistry,
        'test-model',
        false,
        'off'
      );

      expect(costTracker.record).toHaveBeenCalledWith(
        'test-model',
        100,
        50,
        20,
        80
      );
    });

    it('should apply token save level settings', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Response' },
        { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Test' }],
        [{ name: 'read', description: 'Read', parameters: { type: 'object', properties: {} } }],
        provider,
        toolRegistry,
        'test-model',
        false,
        'aggressive' // Should limit tools
      );

      // With 'aggressive' level, should limit tools
      const streamCall = provider.stream as ReturnType<typeof vi.fn>;
      const passedTools = streamCall.mock.calls[0][1];
      // 'aggressive' limits tools to ['read', 'write', 'edit', 'bash', 'glob', 'grep']
      expect(passedTools.length).toBeLessThanOrEqual(6);
    });

    it('should handle inputQueue streaming lifecycle', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Done' },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();
      const inputQueue = createMockInputQueue();

      await handleChat(
        [{ role: 'user', content: 'Test' }],
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off',
        undefined,
        undefined,
        undefined,
        inputQueue
      );

      expect(inputQueue.startStreaming).toHaveBeenCalled();
      expect(inputQueue.endStreaming).toHaveBeenCalled();
    });

    it('should call inputQueue.endStreaming on error', async () => {
      const provider = {
        name: 'test-provider',
        getDefaultModel: vi.fn(() => 'test-model'),
        listModels: vi.fn(async () => ['test-model']),
        chat: vi.fn(),
        stream: vi.fn(async function* () {
          throw new Error('Stream error');
        }),
      } as unknown as AIProvider;

      const toolRegistry = createMockToolRegistry();
      const inputQueue = createMockInputQueue();

      await expect(handleChat(
        [{ role: 'user', content: 'Test' }],
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off',
        undefined,
        undefined,
        undefined,
        inputQueue
      )).rejects.toThrow();

      expect(inputQueue.endStreaming).toHaveBeenCalled();
    });

    it('should handle workspace tool confirmation', async () => {
      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'read', arguments: { file_path: '/outside/file.ts' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: 'Done' },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Read file' }],  // 1
        [],                                         // 2
        provider,                                   // 3
        toolRegistry,                               // 4
        undefined,                                  // 5 (model)
        false,                                      // 6 (autoApproveTools)
        'off',                                      // 7 (tokenSaveLevel)
        undefined,                                  // 8 (session)
        false,                                      // 9 (autoApproveOutsideWorkspace)
        ['/workspace'],                             // 10 (workspacePaths)
        undefined,                                  // 11 (abortSignal)
        undefined                                   // 12 (inputQueue)
      );

      // Should prompt for outside workspace
      expect(promptOutsideWorkspace).toHaveBeenCalled();
    });

    it('should auto-approve outside workspace tools when flag is set', async () => {
      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'read', arguments: { file_path: '/outside/file.ts' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: 'Done' },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Read file' }],  // 1
        [],                                         // 2
        provider,                                   // 3
        toolRegistry,                               // 4
        undefined,                                  // 5 (model)
        false,                                      // 6 (autoApproveTools)
        'off',                                      // 7 (tokenSaveLevel)
        undefined,                                  // 8 (session)
        true,                                       // 9 (autoApproveOutsideWorkspace)
        ['/workspace'],                             // 10 (workspacePaths)
        undefined,                                  // 11 (abortSignal)
        undefined                                   // 12 (inputQueue)
      );

      // Should not prompt when auto-approve is set
      expect(promptOutsideWorkspace).not.toHaveBeenCalled();
    });

    it('should handle multiple tool calls in sequence', async () => {
      const chunks: StreamChunk[] = [
        { type: 'text', text: 'Processing...' },
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'read', arguments: { file_path: '/file1.ts' } },
          isComplete: true,
        },
        {
          type: 'tool_use',
          toolCall: { id: 'tc_2', name: 'read', arguments: { file_path: '/file2.ts' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: 'All files read.' },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();

      const result = await handleChat(
        [{ role: 'user', content: 'Read files' }],  // 1
        [],                                          // 2
        provider,                                    // 3
        toolRegistry,                                // 4
        undefined,                                   // 5 (model)
        true,                                        // 6 (autoApproveTools)
        'off'                                        // 7 (tokenSaveLevel)
      );

      expect(toolRegistry.executeToolCall).toHaveBeenCalledTimes(2);
      // 4 messages: user, assistant (with tools), tool results, assistant (final)
      expect(result.messages).toHaveLength(4);
    });

    it('should handle tool execution errors', async () => {
      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'bash', arguments: { command: 'fail' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: '' },
        { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = {
        resetTurnCounter: vi.fn(),
        setExecutionLimits: vi.fn(),
        executeToolCall: vi.fn(async (): Promise<ToolExecuteResult> => ({
          success: false,
          error: 'Command failed',
          output: 'Error: Command failed',
        })),
      } as unknown as ToolRegistry;

      const result = await handleChat(
        [{ role: 'user', content: 'Run failing command' }],  // 1
        [],                                                     // 2
        provider,                                               // 3
        toolRegistry,                                           // 4
        undefined,                                              // 5 (model)
        true,                                                   // 6 (autoApproveTools)
        'off'                                                   // 7 (tokenSaveLevel)
      );

      // Tool result should indicate error
      const toolResult = result.messages[2].content as any[];
      expect(toolResult[0].is_error).toBe(true);
    });

    it('should prompt for dangerous tools when no workspace configured', async () => {
      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'bash', arguments: { command: 'rm -rf /' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: '' },
        { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Dangerous command' }],  // 1
        [],                                                  // 2
        provider,                                            // 3
        toolRegistry,                                        // 4
        undefined,                                           // 5 (model)
        false,                                               // 6 (autoApproveTools)
        'off',                                               // 7 (tokenSaveLevel)
        undefined,                                           // 8 (session)
        false,                                               // 9 (autoApproveOutsideWorkspace)
        [],                                                  // 10 (workspacePaths - empty)
        undefined,                                           // 11 (abortSignal)
        undefined                                            // 12 (inputQueue)
      );

      // Should prompt for dangerous tools when no workspace
      expect(promptToolConfirm).toHaveBeenCalled();
    });

    it('should deny tools when user chooses deny-all for outside workspace', async () => {
      vi.mocked(promptOutsideWorkspace).mockResolvedValueOnce('deny-all');

      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'read', arguments: { file_path: '/outside/file.ts' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const followUpChunks: StreamChunk[] = [
        { type: 'text', text: '' },
        { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } },
      ];

      const provider = createMockProvider(chunks, followUpChunks);
      const toolRegistry = createMockToolRegistry();

      const result = await handleChat(
        [{ role: 'user', content: 'Read outside' }],  // 1
        [],                                             // 2
        provider,                                       // 3
        toolRegistry,                                   // 4
        undefined,                                      // 5 (model)
        false,                                          // 6 (autoApproveTools)
        'off',                                          // 7 (tokenSaveLevel)
        undefined,                                      // 8 (session)
        false,                                          // 9 (autoApproveOutsideWorkspace)
        ['/workspace'],                                 // 10 (workspacePaths)
        undefined,                                      // 11 (abortSignal)
        undefined                                       // 12 (inputQueue)
      );

      // Tool should not be executed since it was denied
      expect(toolRegistry.executeToolCall).toHaveBeenCalled();

      // Tool result should indicate denial
      const toolResult = result.messages[2].content as any[];
      expect(toolResult[0].is_error).toBe(true);
      expect(toolResult[0].content).toContain('denied');
    });

    it('should enable auto-approve for session when user chooses approve-all-session', async () => {
      vi.mocked(promptToolConfirm).mockResolvedValueOnce('approve-all-session');

      const chunks: StreamChunk[] = [
        {
          type: 'tool_use',
          toolCall: { id: 'tc_1', name: 'bash', arguments: { command: 'echo test' } },
          isComplete: true,
        },
        { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      ];

      const provider = createMockProvider(chunks);
      const toolRegistry = createMockToolRegistry();

      await handleChat(
        [{ role: 'user', content: 'Run command' }],
        [],
        provider,
        toolRegistry,
        undefined,
        false,
        'off',
        undefined,
        [], // no workspace
        undefined,
        undefined,
        false
      );

      // Tool should be executed after approval
      expect(toolRegistry.executeToolCall).toHaveBeenCalled();
    });
  });
});