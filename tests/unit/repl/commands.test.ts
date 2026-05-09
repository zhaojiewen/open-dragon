import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chalk FIRST - before any imports
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

// Mock logger FIRST - create mock inside factory
vi.mock('../../../src/utils/logger.js', () => {
  const mockLogger = {
    _level: 1,
    setLevel: vi.fn((level: number) => {
      mockLogger._level = level;
    }),
    getLevel: vi.fn(() => mockLogger._level),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
  };
});

// Mock perfMonitor FIRST
vi.mock('../../../src/performance/index.js', () => ({
  perfMonitor: {
    isEnabled: vi.fn(() => false),
    printReport: vi.fn(),
    setEnabled: vi.fn(),
    clear: vi.fn(),
  },
}));

// Mock costTracker FIRST
vi.mock('../../../src/utils/cost-tracker.js', () => ({
  costTracker: {
    getSessionCost: vi.fn(() => 0),
    getSessionTokens: vi.fn(() => ({ input: 0, output: 0 })),
    getTotalTokens: vi.fn(() => 0),
    getCacheStats: vi.fn(() => ({
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheCostSavings: 0,
    })),
    getEffectiveCost: vi.fn(() => 0),
    getRecords: vi.fn(() => []),
    getSummary: vi.fn(() => 'Mock summary'),
    reset: vi.fn(),
    record: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

// Mock createProvider FIRST
vi.mock('../../../src/providers/index.js', () => ({
  createProvider: vi.fn(),
}));

// Mock saveConfig FIRST
vi.mock('../../../src/config/index.js', () => ({
  saveConfig: vi.fn(),
}));

// Mock handlers FIRST
vi.mock('../../../src/repl/handlers.js', () => ({
  handleWorkspaceCommand: vi.fn(() => true),
  handleSkillsCommand: vi.fn(),
}));

// Mock fs for file operations
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock os for home directory
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// NOW import the modules after mocks are set up
import {
  handleCommand,
  handleAskCommand,
  handleAutoskillCommand,
} from '../../../src/repl/commands.js';
import type { SessionState, TokenSaveLevel } from '../../../src/repl/config.js';
import type { DragonConfig } from '../../../src/config/index.js';
import type { Message } from '../../../src/providers/base.js';
import type { ToolRegistry } from '../../../src/tools/index.js';

// Import mocked modules to use in tests
import { perfMonitor } from '../../../src/performance/index.js';
import { costTracker } from '../../../src/utils/cost-tracker.js';
import { createProvider } from '../../../src/providers/index.js';
import { saveConfig } from '../../../src/config/index.js';
import { getLogger } from '../../../src/utils/logger.js';
import fs from 'fs';

describe('commands', () => {
  let mockConfig: DragonConfig;
  let mockMessages: Message[];
  let mockToolRegistry: ToolRegistry;
  let mockSession: SessionState;
  let consoleSpy: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mock logger instance and reset its level
    mockLogger = getLogger();
    mockLogger._level = 1;

    mockConfig = {
      defaultProvider: 'anthropic',
      providers: {
        anthropic: {
          apiKey: 'test-key',
          baseUrl: 'https://api.anthropic.com',
          models: ['claude-sonnet-4-6'],
          defaultModel: 'claude-sonnet-4-6',
        },
        openai: {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com',
          models: ['gpt-4o'],
          defaultModel: 'gpt-4o',
        },
      },
    } as DragonConfig;

    mockMessages = [];

    mockToolRegistry = {
      getToolDefinitions: vi.fn(() => [
        { name: 'read', description: 'Read files', parameters: { type: 'object', properties: {} } },
        { name: 'write', description: 'Write files', parameters: { type: 'object', properties: {} } },
        { name: 'bash', description: 'Execute commands', parameters: { type: 'object', properties: {} } },
        { name: 'webfetch', description: 'Fetch web content', parameters: { type: 'object', properties: {} } },
      ]),
      executeToolCall: vi.fn(),
      setWorkingDirectory: vi.fn(),
      setPermissions: vi.fn(),
      setWorkspaceScope: vi.fn(),
      setProvider: vi.fn(),
      setSkills: vi.fn(),
      register: vi.fn(),
      resetTurnCounter: vi.fn(),
      getTotalToolCalls: vi.fn(() => 0),
      getEnabledTools: vi.fn(() => ['read', 'write', 'bash', 'webfetch']),
      isToolEnabled: vi.fn(() => true),
    } as any;

    mockSession = {
      provider: {
        getDefaultModel: vi.fn(() => 'claude-sonnet-4-6'),
        listModels: vi.fn(() => ['claude-sonnet-4-6', 'claude-opus-4-7']),
      },
      providerName: 'anthropic',
      model: 'claude-sonnet-4-6',
      autoApproveTools: false,
      autoApproveOutsideWorkspace: false,
      tokenSaveLevel: 'off',
      tokenSavePrompted: false,
    } as SessionState;

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ============================================
  // handleCommand - main routing function
  // ============================================
  describe('handleCommand', () => {
    describe('command routing', () => {
      it('should handle /help command', async () => {
        const result = await handleCommand('/help', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Commands:');
        expect(output).toContain('/clear');
        expect(output).toContain('/history');
      });

      it('should handle /clear command', async () => {
        mockMessages.push({ role: 'user', content: 'test' });
        const result = await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        expect(mockMessages.length).toBe(0);
        expect(costTracker.reset).toHaveBeenCalled();
      });

      it('should handle /history command', async () => {
        const result = await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /provider command', async () => {
        const result = await handleCommand('/provider', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /model command', async () => {
        const result = await handleCommand('/model', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /tools command', async () => {
        const result = await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /skills command', async () => {
        const result = await handleCommand('/skills', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /perf command', async () => {
        const result = await handleCommand('/perf', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /performance alias', async () => {
        const result = await handleCommand('/performance', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /debug command', async () => {
        const result = await handleCommand('/debug', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /cost command', async () => {
        const result = await handleCommand('/cost', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /cache command', async () => {
        const result = await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /save command', async () => {
        const result = await handleCommand('/save', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /load command', async () => {
        const result = await handleCommand('/load', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /encrypt command', async () => {
        const result = await handleCommand('/encrypt', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('dragon init --encrypt');
      });

      it('should handle /exit command', async () => {
        const result = await handleCommand('/exit', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(false);
      });

      it('should handle /quit alias', async () => {
        const result = await handleCommand('/quit', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(false);
      });

      it('should handle /auto command', async () => {
        const result = await handleCommand('/auto', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /ask command', async () => {
        const result = await handleCommand('/ask', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /workspace command', async () => {
        const result = await handleCommand('/workspace', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /ws alias', async () => {
        const result = await handleCommand('/ws', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /save-tokens command', async () => {
        const result = await handleCommand('/save-tokens', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /eco alias', async () => {
        const result = await handleCommand('/eco', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle /autoskill command', async () => {
        const result = await handleCommand('/autoskill', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle unknown command', async () => {
        const result = await handleCommand('/unknown', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Unknown command');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase commands', async () => {
        const result = await handleCommand('/HELP', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle mixed case commands', async () => {
        const result = await handleCommand('/HeLp', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should handle uppercase /EXIT', async () => {
        const result = await handleCommand('/EXIT', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(false);
      });
    });

    describe('command with arguments', () => {
      it('should pass arguments to /provider', async () => {
        const mockProvider = {
          getDefaultModel: vi.fn(() => 'gpt-4o'),
          listModels: vi.fn(() => ['gpt-4o']),
        };
        (createProvider as any).mockReturnValue(mockProvider);

        const result = await handleCommand('/provider openai', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        expect(createProvider).toHaveBeenCalledWith('openai', mockConfig);
      });

      it('should pass arguments to /model', async () => {
        const result = await handleCommand('/model gpt-4o', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        expect(mockSession.model).toBe('gpt-4o');
      });

      it('should pass arguments to /tools enable', async () => {
        const result = await handleCommand('/tools enable bash', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('enabled');
      });

      it('should pass arguments to /tools disable', async () => {
        const result = await handleCommand('/tools disable bash', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('disabled');
      });

      it('should pass arguments to /save with filename', async () => {
        const result = await handleCommand('/save test-session.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });

      it('should pass arguments to /load', async () => {
        const result = await handleCommand('/load test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(result).toBe(true);
      });
    });
  });

  // ============================================
  // showHistory
  // ============================================
  describe('showHistory', () => {
    it('should show empty history message when no messages', async () => {
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No conversation history');
    });

    it('should count user messages correctly', async () => {
      mockMessages.push(
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' }
      );
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('3 messages');
      expect(output).toContain('2 user turns');
    });

    it('should display string content preview', async () => {
      mockMessages.push(
        { role: 'user', content: 'This is a test message that should be truncated if it is too long' }
      );
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('You');
      expect(output).toContain('This is a test');
    });

    it('should truncate long messages to 120 characters', async () => {
      const longContent = 'A'.repeat(200);
      mockMessages.push({ role: 'user', content: longContent });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('...');
    });

    it('should handle array content with tool_use blocks', async () => {
      mockMessages.push({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help' },
          { type: 'tool_use', id: '1', name: 'bash', input: {} },
        ],
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('1 tool_use');
      expect(output).toContain('1 text');
    });

    it('should handle array content with tool_result blocks', async () => {
      mockMessages.push({
        role: 'tool',
        content: [{ type: 'tool_result', toolUseId: '1', content: 'result' }],
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('1 tool_result');
    });

    it('should count tool messages correctly', async () => {
      mockMessages.push(
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: '1', name: 'bash', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: '1', content: 'result' }],
        }
      );
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('1 tool results');
    });

    it('should display multiple tool_use blocks count', async () => {
      mockMessages.push({
        role: 'assistant',
        content: [
          { type: 'tool_use', id: '1', name: 'bash', input: {} },
          { type: 'tool_use', id: '2', name: 'read', input: {} },
        ],
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('2 tool_use');
    });

    it('should handle messages with mixed content types', async () => {
      mockMessages.push({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: '1', name: 'bash', input: {} },
          { type: 'tool_result', toolUseId: '2', content: 'result' },
        ],
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('1 tool_use');
      expect(output).toContain('1 tool_result');
      expect(output).toContain('1 text');
    });

    it('should display role with proper icons', async () => {
      mockMessages.push(
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' }
      );
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('You');
      expect(output).toContain('Assistant');
    });

    it('should handle unknown roles', async () => {
      mockMessages.push({ role: 'system', content: 'System message' } as Message);
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('system');
    });

    it('should replace newlines in preview', async () => {
      mockMessages.push({
        role: 'user',
        content: 'Line 1\nLine 2\nLine 3',
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      // Should not have literal newline in preview (replaced with space)
      const previewLine = consoleSpy.mock.calls.find(c => c[0]?.includes('You'));
      expect(previewLine).toBeDefined();
    });

    it('should handle empty content blocks', async () => {
      mockMessages.push({
        role: 'assistant',
        content: [],
      });
      await handleCommand('/history', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('1 messages');
    });
  });

  // ============================================
  // handleToolsCommand
  // ============================================
  describe('handleToolsCommand', () => {
    describe('enable/disable', () => {
      it('should enable a tool', async () => {
        await handleCommand('/tools enable bash', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('bash');
        expect(output).toContain('enabled');
      });

      it('should disable a tool', async () => {
        await handleCommand('/tools disable bash', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('bash');
        expect(output).toContain('disabled');
      });

      it('should handle enable without tool name', async () => {
        await handleCommand('/tools enable', mockConfig, mockMessages, mockToolRegistry, mockSession);
        // Falls through to listing
        expect(mockToolRegistry.getToolDefinitions).toHaveBeenCalled();
      });

      it('should handle disable without tool name', async () => {
        await handleCommand('/tools disable', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockToolRegistry.getToolDefinitions).toHaveBeenCalled();
      });
    });

    describe('tool listing', () => {
      it('should list all tools', async () => {
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockToolRegistry.getToolDefinitions).toHaveBeenCalled();
      });

      it('should categorize file tools', async () => {
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([
          { name: 'read', description: 'Read files', parameters: { type: 'object', properties: {} } },
          { name: 'write', description: 'Write files', parameters: { type: 'object', properties: {} } },
          { name: 'edit', description: 'Edit files', parameters: { type: 'object', properties: {} } },
          { name: 'glob', description: 'Glob files', parameters: { type: 'object', properties: {} } },
          { name: 'grep', description: 'Grep files', parameters: { type: 'object', properties: {} } },
        ]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Files:');
      });

      it('should categorize execution tools', async () => {
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([
          { name: 'bash', description: 'Execute commands', parameters: { type: 'object', properties: {} } },
          { name: 'agent', description: 'Run agent', parameters: { type: 'object', properties: {} } },
        ]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Execution:');
      });

      it('should categorize web tools', async () => {
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([
          { name: 'webfetch', description: 'Fetch web', parameters: { type: 'object', properties: {} } },
          { name: 'websearch', description: 'Search web', parameters: { type: 'object', properties: {} } },
        ]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Web:');
      });

      it('should categorize custom/skill tools', async () => {
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([
          { name: 'custom_skill', description: 'Custom tool', parameters: { type: 'object', properties: {} } },
        ]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Skills:');
      });

      it('should show enabled status with checkmark', async () => {
        mockConfig.tools = { enabled: ['read', 'write'] };
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockToolRegistry.getToolDefinitions).toHaveBeenCalledWith(['read', 'write']);
      });

      it('should show disabled status with cross', async () => {
        mockConfig.tools = { enabled: ['read'] };
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([
          { name: 'read', description: 'Read', parameters: { type: 'object', properties: {} } },
          { name: 'write', description: 'Write', parameters: { type: 'object', properties: {} } },
        ]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('write');
      });

      it('should handle empty tool list', async () => {
        (mockToolRegistry.getToolDefinitions as any).mockReturnValue([]);
        await handleCommand('/tools', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Tools:');
      });
    });
  });

  // ============================================
  // handlePerfCommand
  // ============================================
  describe('handlePerfCommand', () => {
    it('should show disabled message when perfMonitor is disabled', async () => {
      (perfMonitor.isEnabled as any).mockReturnValue(false);
      await handleCommand('/perf', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('disabled');
      expect(output).toContain('--monitor flag');
    });

    it('should print report when perfMonitor is enabled', async () => {
      (perfMonitor.isEnabled as any).mockReturnValue(true);
      await handleCommand('/perf', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(perfMonitor.printReport).toHaveBeenCalled();
    });

    it('should handle /performance alias', async () => {
      (perfMonitor.isEnabled as any).mockReturnValue(false);
      await handleCommand('/performance', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('disabled');
    });
  });

  // ============================================
  // handleDebugCommand
  // ============================================
  describe('handleDebugCommand', () => {
    it('should enable debug mode with "on"', async () => {
      await handleCommand('/debug on', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockLogger.setLevel).toHaveBeenCalledWith(0);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode enabled');
    });

    it('should disable debug mode with "off"', async () => {
      await handleCommand('/debug off', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockLogger.setLevel).toHaveBeenCalledWith(1);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode disabled');
    });

    it('should show current debug status with no args', async () => {
      mockLogger._level = 1;
      await handleCommand('/debug', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode');
      expect(output).toContain('OFF');
    });

    it('should show ON status when debug is enabled', async () => {
      mockLogger._level = 0;
      await handleCommand('/debug', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('ON');
    });

    it('should not handle uppercase "ON" (case sensitive)', async () => {
      await handleCommand('/debug ON', mockConfig, mockMessages, mockToolRegistry, mockSession);
      // Implementation is case-sensitive, so uppercase doesn't trigger on
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode');
    });

    it('should not handle uppercase "OFF" (case sensitive)', async () => {
      await handleCommand('/debug OFF', mockConfig, mockMessages, mockToolRegistry, mockSession);
      // Implementation is case-sensitive, so uppercase doesn't trigger off
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode');
    });

    it('should not handle mixed case (case sensitive)', async () => {
      await handleCommand('/debug On', mockConfig, mockMessages, mockToolRegistry, mockSession);
      // Implementation is case-sensitive, so mixed case doesn't trigger on
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Debug mode');
    });
  });

  // ============================================
  // handleCostCommand
  // ============================================
  describe('handleCostCommand', () => {
    it('should show no cost message when empty', async () => {
      (costTracker.getSessionCost as any).mockReturnValue(0);
      (costTracker.getRecords as any).mockReturnValue([]);
      await handleCommand('/cost', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No cost data recorded');
    });

    it('should show cost summary when populated', async () => {
      (costTracker.getSessionCost as any).mockReturnValue(0.05);
      (costTracker.getRecords as any).mockReturnValue([{ model: 'gpt-4o', cost: 0.05 }]);
      await handleCommand('/cost', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Session cost summary');
      expect(costTracker.getSummary).toHaveBeenCalledWith(true);
    });

    it('should include cost estimate note', async () => {
      (costTracker.getSessionCost as any).mockReturnValue(0.01);
      (costTracker.getRecords as any).mockReturnValue([{ model: 'test', cost: 0.01 }]);
      await handleCommand('/cost', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('estimates');
    });
  });

  // ============================================
  // handleCacheCommand
  // ============================================
  describe('handleCacheCommand', () => {
    describe('no cache data', () => {
      it('should show no cache data message', async () => {
        (costTracker.getCacheStats as any).mockReturnValue({
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cacheCostSavings: 0,
        });
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No cache data recorded');
      });

      it('should explain cache conditions', async () => {
        (costTracker.getCacheStats as any).mockReturnValue({
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cacheCostSavings: 0,
        });
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('token-saving level');
      });
    });

    describe('with cache data', () => {
      beforeEach(() => {
        (costTracker.getCacheStats as any).mockReturnValue({
          cacheCreationTokens: 1000,
          cacheReadTokens: 5000,
          cacheCostSavings: 0.01,
        });
        (costTracker.getSessionTokens as any).mockReturnValue({ input: 10000, output: 2000 });
        (costTracker.getSessionCost as any).mockReturnValue(0.05);
        (costTracker.getEffectiveCost as any).mockReturnValue(0.04);
        (costTracker.getTotalTokens as any).mockReturnValue(12000);
      });

      it('should show cache writes', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Cache writes');
        expect(output).toContain('1,000');
      });

      it('should show cache reads', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Cache reads');
        expect(output).toContain('5,000');
      });

      it('should show hit rate', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Cache hit rate');
        expect(output).toContain('50.0%');
      });

      it('should show cache savings', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Cache savings');
      });

      it('should show effective cost', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Effective cost');
      });

      it('should show savings percentage when > 0', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Savings:');
        expect(output).toContain('%');
      });
    });

    describe('token save level display', () => {
      it('should show current token save level', async () => {
        mockSession.tokenSaveLevel = 'off';
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('off');
      });

      it('should show mild level', async () => {
        mockSession.tokenSaveLevel = 'mild';
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('mild');
      });

      it('should show moderate level', async () => {
        mockSession.tokenSaveLevel = 'moderate';
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('moderate');
      });

      it('should show aggressive level', async () => {
        mockSession.tokenSaveLevel = 'aggressive';
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('aggressive');
      });

      it('should show hint for changing level', async () => {
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('/save-tokens');
      });
    });

    describe('hit rate calculation', () => {
      it('should handle zero input tokens', async () => {
        (costTracker.getCacheStats as any).mockReturnValue({
          cacheCreationTokens: 100,
          cacheReadTokens: 50,
          cacheCostSavings: 0,
        });
        (costTracker.getSessionTokens as any).mockReturnValue({ input: 0, output: 0 });
        (costTracker.getTotalTokens as any).mockReturnValue(0);
        await handleCommand('/cache', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('0.0%');
      });
    });
  });

  // ============================================
  // handleSaveCommand
  // ============================================
  describe('handleSaveCommand', () => {
    describe('save to file', () => {
      it('should save messages to default filename', async () => {
        mockMessages.push(
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' }
        );
        await handleCommand('/save', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(fs.writeFileSync).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Session saved');
      });

      it('should save to custom filename', async () => {
        mockMessages.push({ role: 'user', content: 'test' });
        await handleCommand('/save my-session.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const writeCall = (fs.writeFileSync as any).mock.calls[0];
        expect(writeCall[0]).toContain('my-session.json');
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('my-session.json');
      });

      it('should save to absolute path', async () => {
        mockMessages.push({ role: 'user', content: 'test' });
        await handleCommand('/save /tmp/test-session.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const writeCall = (fs.writeFileSync as any).mock.calls[0];
        expect(writeCall[0]).toBe('/tmp/test-session.json');
      });

      it('should handle array content serialization', async () => {
        mockMessages.push({
          role: 'assistant',
          content: [{ type: 'tool_use', id: '1', name: 'bash', input: {} }],
        });
        await handleCommand('/save test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(fs.writeFileSync).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Session saved');
      });
    });

    describe('error handling', () => {
      it('should handle write errors', async () => {
        (fs.writeFileSync as any).mockImplementation(() => {
          throw new Error('Permission denied');
        });

        mockMessages.push({ role: 'user', content: 'test' });
        await handleCommand('/save /root/test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to save');
      });

      it('should handle mkdir errors', async () => {
        (fs.mkdirSync as any).mockImplementation(() => {
          throw new Error('Cannot create directory');
        });

        mockMessages.push({ role: 'user', content: 'test' });
        await handleCommand('/save test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to save');
      });
    });

    describe('empty messages', () => {
      it('should handle empty messages', async () => {
        // Ensure fs mocks are working (not throwing)
        (fs.mkdirSync as any).mockImplementation(() => {});
        (fs.writeFileSync as any).mockImplementation(() => {});
        await handleCommand('/save test.json', mockConfig, [], mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Session saved');
      });
    });
  });

  // ============================================
  // handleLoadCommand
  // ============================================
  describe('handleLoadCommand', () => {
    describe('usage', () => {
      it('should show usage when no filename provided', async () => {
        await handleCommand('/load', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Usage');
        expect(output).toContain('/load <filename>');
      });
    });

    describe('load from file', () => {
      it('should load messages from file', async () => {
        (fs.readFileSync as any).mockReturnValue(
          JSON.stringify([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
          ])
        );

        await handleCommand('/load test-session.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockMessages.length).toBe(2);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Loaded');
        expect(output).toContain('2 messages');
      });

      it('should handle absolute path', async () => {
        (fs.readFileSync as any).mockReturnValue(
          JSON.stringify([{ role: 'user', content: 'test' }])
        );

        await handleCommand('/load /tmp/test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockMessages.length).toBe(1);
      });
    });

    describe('error handling', () => {
      it('should handle missing file', async () => {
        (fs.readFileSync as any).mockImplementation(() => {
          throw new Error('ENOENT: no such file');
        });

        await handleCommand('/load nonexistent.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to load');
      });

      it('should handle invalid JSON', async () => {
        (fs.readFileSync as any).mockReturnValue('not valid json');

        await handleCommand('/load invalid.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to load');
      });

      it('should handle invalid format (non-array)', async () => {
        (fs.readFileSync as any).mockReturnValue(
          JSON.stringify({ invalid: 'format' })
        );

        await handleCommand('/load invalid-format.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Invalid session file format');
      });
    });

    describe('clear existing messages', () => {
      it('should clear existing messages before loading', async () => {
        mockMessages.push({ role: 'user', content: 'existing' });

        (fs.readFileSync as any).mockReturnValue(
          JSON.stringify([{ role: 'user', content: 'new' }])
        );

        await handleCommand('/load test.json', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockMessages.length).toBe(1);
        expect(mockMessages[0].content).toBe('new');
      });
    });
  });

  // ============================================
  // handleAutoCommand
  // ============================================
  describe('handleAutoCommand', () => {
    describe('toggle auto-approve', () => {
      it('should toggle autoApproveTools on', async () => {
        mockSession.autoApproveTools = false;
        await handleCommand('/auto', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.autoApproveTools).toBe(true);
        expect(mockSession.autoApproveOutsideWorkspace).toBe(true);
      });

      it('should toggle autoApproveTools off', async () => {
        mockSession.autoApproveTools = true;
        mockSession.autoApproveOutsideWorkspace = true;
        await handleCommand('/auto', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.autoApproveTools).toBe(false);
        expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
      });

      it('should show warning when enabling', async () => {
        mockSession.autoApproveTools = false;
        await handleCommand('/auto', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Auto-approve');
      });

      it('should show success when disabling', async () => {
        mockSession.autoApproveTools = true;
        await handleCommand('/auto', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Confirmation required');
      });
    });

    describe('outside workspace toggle', () => {
      it('should toggle autoApproveOutsideWorkspace with "out"', async () => {
        mockSession.autoApproveOutsideWorkspace = false;
        await handleCommand('/auto out', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.autoApproveOutsideWorkspace).toBe(true);
      });

      it('should toggle autoApproveOutsideWorkspace with "outside"', async () => {
        mockSession.autoApproveOutsideWorkspace = true;
        await handleCommand('/auto outside', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
      });

      it('should not change autoApproveTools with "out"', async () => {
        mockSession.autoApproveTools = false;
        await handleCommand('/auto out', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.autoApproveTools).toBe(false);
      });

      it('should show warning when enabling outside', async () => {
        mockSession.autoApproveOutsideWorkspace = false;
        await handleCommand('/auto out', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Out-of-workspace');
      });

      it('should show success when disabling outside', async () => {
        mockSession.autoApproveOutsideWorkspace = true;
        await handleCommand('/auto out', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('requires confirmation');
      });
    });
  });

  // ============================================
  // handleSaveTokensCommand
  // ============================================
  describe('handleSaveTokensCommand', () => {
    describe('set level', () => {
      it('should set level to off', async () => {
        mockSession.tokenSaveLevel = 'mild';
        await handleCommand('/save-tokens off', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('off');
        expect(mockConfig.defaultTokenSaveLevel).toBe('off');
      });

      it('should set level to mild', async () => {
        await handleCommand('/save-tokens mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('mild');
      });

      it('should set level to moderate', async () => {
        await handleCommand('/save-tokens moderate', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('moderate');
      });

      it('should set level to aggressive', async () => {
        await handleCommand('/save-tokens aggressive', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('aggressive');
      });

      it('should show success message when setting level', async () => {
        await handleCommand('/save-tokens mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Token-saving');
      });

      it('should show info for off level', async () => {
        await handleCommand('/save-tokens off', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('full quality');
      });

      it('should show cache info for mild level', async () => {
        await handleCommand('/save-tokens mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('32K max');
      });

      it('should show no cache for moderate level', async () => {
        await handleCommand('/save-tokens moderate', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('no cache');
      });

      it('should show tools limit for aggressive level', async () => {
        await handleCommand('/save-tokens aggressive', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('file ops only');
      });

      it('should handle /eco alias', async () => {
        await handleCommand('/eco moderate', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('moderate');
      });
    });

    describe('invalid level', () => {
      it('should show error for invalid level', async () => {
        await handleCommand('/save-tokens invalid', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Unknown level');
      });

      it('should show valid levels in error', async () => {
        await handleCommand('/save-tokens bad', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('off');
        expect(output).toContain('mild');
        expect(output).toContain('moderate');
        expect(output).toContain('aggressive');
      });
    });

    describe('show levels (no args)', () => {
      it('should list all levels', async () => {
        await handleCommand('/save-tokens', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('off');
        expect(output).toContain('mild');
        expect(output).toContain('moderate');
        expect(output).toContain('aggressive');
      });

      it('should show current level marker', async () => {
        mockSession.tokenSaveLevel = 'mild';
        await handleCommand('/save-tokens', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('mild');
      });

      it('should show explanation', async () => {
        await handleCommand('/save-tokens', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('trade');
      });
    });

    describe('config persistence', () => {
      it('should call saveConfig asynchronously', async () => {
        await handleCommand('/save-tokens mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        await new Promise(r => setTimeout(r, 50));
        expect(saveConfig).toHaveBeenCalledWith(mockConfig);
      });
    });

    describe('tokenSavePrompted flag', () => {
      it('should set tokenSavePrompted to true', async () => {
        mockSession.tokenSavePrompted = false;
        await handleCommand('/save-tokens mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSavePrompted).toBe(true);
      });

      it('should set tokenSavePrompted even with no args', async () => {
        mockSession.tokenSavePrompted = false;
        await handleCommand('/save-tokens', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSavePrompted).toBe(true);
      });
    });

    describe('case sensitivity', () => {
      it('should accept uppercase levels', async () => {
        await handleCommand('/save-tokens OFF', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('off');
      });

      it('should accept mixed case levels', async () => {
        await handleCommand('/save-tokens Mild', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.tokenSaveLevel).toBe('mild');
      });
    });
  });

  // ============================================
  // handleProviderCommand
  // ============================================
  describe('handleProviderCommand', () => {
    describe('show current provider', () => {
      it('should show current provider with no args', async () => {
        await handleCommand('/provider', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('anthropic');
      });
    });

    describe('switch provider', () => {
      it('should switch to valid provider', async () => {
        const mockProvider = {
          getDefaultModel: vi.fn(() => 'gpt-4o'),
          listModels: vi.fn(() => ['gpt-4o']),
        };
        (createProvider as any).mockReturnValue(mockProvider);

        await handleCommand('/provider openai', mockConfig, mockMessages, mockToolRegistry, mockSession);

        expect(createProvider).toHaveBeenCalledWith('openai', mockConfig);
        expect(mockSession.providerName).toBe('openai');
        expect(mockSession.model).toBe('gpt-4o');
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Switched');
        expect(output).toContain('openai');
      });

      it('should show error for unconfigured provider', async () => {
        await handleCommand('/provider unknown', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('not configured');
        expect(output).toContain('unknown');
      });

      it('should handle createProvider errors', async () => {
        (createProvider as any).mockImplementation(() => {
          throw new Error('API key invalid');
        });

        await handleCommand('/provider openai', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to switch');
      });
    });

    describe('case sensitivity', () => {
      it('should handle lowercase provider name', async () => {
        const mockProvider = {
          getDefaultModel: vi.fn(() => 'gpt-4o'),
        };
        (createProvider as any).mockReturnValue(mockProvider);

        await handleCommand('/provider openai', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(createProvider).toHaveBeenCalledWith('openai', mockConfig);
      });
    });
  });

  // ============================================
  // handleModelCommand
  // ============================================
  describe('handleModelCommand', () => {
    describe('show current model', () => {
      it('should show current model with no args', async () => {
        await handleCommand('/model', mockConfig, mockMessages, mockToolRegistry, mockSession);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('claude-sonnet-4-6');
      });

      it('should list available models', async () => {
        await handleCommand('/model', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.provider.listModels).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Available models');
      });
    });

    describe('change model', () => {
      it('should change model', async () => {
        await handleCommand('/model claude-opus-4-7', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.model).toBe('claude-opus-4-7');
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Model set to');
      });

      it('should accept any model name', async () => {
        await handleCommand('/model custom-model', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.model).toBe('custom-model');
      });

      it('should handle special characters in model name', async () => {
        await handleCommand('/model model-2024-01-01', mockConfig, mockMessages, mockToolRegistry, mockSession);
        expect(mockSession.model).toBe('model-2024-01-01');
      });
    });
  });

  // ============================================
  // clearSession
  // ============================================
  describe('clearSession', () => {
    it('should clear messages array', async () => {
      mockMessages.push(
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' }
      );
      await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockMessages.length).toBe(0);
    });

    it('should reset cost tracker', async () => {
      await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(costTracker.reset).toHaveBeenCalled();
    });

    it('should reset tokenSavePrompted', async () => {
      mockSession.tokenSavePrompted = true;
      await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockSession.tokenSavePrompted).toBe(false);
    });

    it('should show cleared message', async () => {
      await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('cleared');
    });

    it('should handle empty messages array', async () => {
      await handleCommand('/clear', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockMessages.length).toBe(0);
    });
  });

  // ============================================
  // handleAutoskillCommand (imported)
  // ============================================
  describe('handleAutoskillCommand via handleCommand', () => {
    it('should handle /autoskill', async () => {
      await handleCommand('/autoskill', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Auto-Skill');
    });

    it('should handle /autoskill on', async () => {
      await handleCommand('/autoskill on 30', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(30);
    });

    it('should handle /autoskill off', async () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 30 };
      await handleCommand('/autoskill off', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockConfig.autoSkill?.enabled).toBe(false);
    });
  });

  // ============================================
  // handleAskCommand (imported)
  // ============================================
  describe('handleAskCommand via handleCommand', () => {
    it('should handle /ask', async () => {
      mockSession.autoApproveTools = true;
      await handleCommand('/ask', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should handle /ask on', async () => {
      mockSession.autoApproveTools = true;
      await handleCommand('/ask on', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should handle /ask off', async () => {
      mockSession.autoApproveTools = false;
      await handleCommand('/ask off', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(mockSession.autoApproveTools).toBe(true);
    });

    it('should handle unknown subcommand', async () => {
      await handleCommand('/ask unknown', mockConfig, mockMessages, mockToolRegistry, mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });
  });

  // ============================================
  // Direct handleAskCommand tests
  // ============================================
  describe('handleAskCommand direct', () => {
    it('should enable strict mode with no args', () => {
      mockSession.autoApproveTools = true;
      mockSession.autoApproveOutsideWorkspace = true;
      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should enable strict mode with "on"', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand(['on'], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should disable strict mode with "off"', () => {
      mockSession.autoApproveTools = false;
      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(true);
    });

    it('should handle case sensitivity', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand(['ON'], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should handle unknown subcommand', () => {
      handleAskCommand(['invalid'], mockSession);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });
  });

  // ============================================
  // Direct handleAutoskillCommand tests
  // ============================================
  describe('handleAutoskillCommand direct', () => {
    it('should show status with no args', () => {
      handleAutoskillCommand([], mockConfig);
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Auto-Skill');
    });

    it('should enable with interval', () => {
      handleAutoskillCommand(['on', '30'], mockConfig);
      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(30);
    });

    it('should reject interval less than 5', () => {
      handleAutoskillCommand(['on', '3'], mockConfig);
      expect(mockConfig.autoSkill).toBeUndefined();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('at least 5');
    });

    it('should enable with default interval', () => {
      handleAutoskillCommand(['on'], mockConfig);
      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should disable', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 30 };
      handleAutoskillCommand(['off'], mockConfig);
      expect(mockConfig.autoSkill?.enabled).toBe(false);
    });

    it('should create config when disabling with no existing config', () => {
      // This tests the else branch at line 509
      mockConfig.autoSkill = undefined;
      handleAutoskillCommand(['off'], mockConfig);
      expect(mockConfig.autoSkill?.enabled).toBe(false);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should set interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '60'], mockConfig);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(60);
      expect(mockConfig.autoSkill?.enabled).toBe(true);
    });

    it('should accept "set" alias for interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['set', '45'], mockConfig);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(45);
    });

    it('should reject invalid interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', 'abc'], mockConfig);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should reject too small interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '2'], mockConfig);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });
  });
});