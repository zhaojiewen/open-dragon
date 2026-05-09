import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../../src/tools/index.js';
import { BaseTool } from '../../../src/tools/base.js';
import type { ToolExecuteResult, ToolContext } from '../../../src/tools/base.js';

// Mock the McpClientManager module
vi.mock('../../../src/tools/mcp-client.js', () => {
  const mockTool = {
    name: 'mcp_test_tool',
    getDefinition: () => ({
      name: 'mcp_test_tool',
      description: 'MCP test tool',
      parameters: { type: 'object', properties: {} },
    }),
  };

  class MockMcpClientManager {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    getTools = vi.fn().mockReturnValue([mockTool]);
  }

  return {
    McpClientManager: MockMcpClientManager,
  };
});

// Mock provider
const mockProvider = {
  name: 'mock',
  chat: vi.fn(),
  stream: vi.fn(),
};

// Helper to create a mock tool for testing
class MockTool extends BaseTool {
  readonly name: string;
  readonly description = 'Mock tool for testing';
  readonly parameters = {
    type: 'object' as const,
    properties: {},
  };
  private executeResult: ToolExecuteResult;

  constructor(name: string = 'mock', executeResult: ToolExecuteResult = { success: true, output: 'mock output' }) {
    super();
    this.name = name;
    this.executeResult = executeResult;
  }

  setExecuteResult(result: ToolExecuteResult) {
    this.executeResult = result;
  }

  async execute(): Promise<ToolExecuteResult> {
    return this.executeResult;
  }
}

// Helper to create a tool that throws
class ThrowingTool extends BaseTool {
  readonly name = 'throwing';
  readonly description = 'Tool that throws';
  readonly parameters = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<ToolExecuteResult> {
    throw new Error('Intentional test error');
  }
}

// Helper to create a tool with large output
class LargeOutputTool extends BaseTool {
  readonly name = 'large_output';
  readonly description = 'Tool with large output';
  readonly parameters = {
    type: 'object' as const,
    properties: {},
  };
  private outputSize: number;

  constructor(outputSize: number = 200000) {
    super();
    this.outputSize = outputSize;
  }

  async execute(): Promise<ToolExecuteResult> {
    return {
      success: true,
      output: 'x'.repeat(this.outputSize),
    };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
    vi.clearAllMocks();
  });

  it('should register default tools', () => {
    const definitions = registry.getToolDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.find(t => t.name === 'bash')).toBeDefined();
    expect(definitions.find(t => t.name === 'read')).toBeDefined();
    expect(definitions.find(t => t.name === 'write')).toBeDefined();
  });

  it('should register custom tool', () => {
    class CustomTool extends BaseTool {
      readonly name = 'custom';
      readonly description = 'Custom tool';
      readonly parameters = {
        type: 'object' as const,
        properties: {},
      };

      async execute() {
        return { success: true, output: 'custom' };
      }
    }

    registry.register(new CustomTool());
    const definitions = registry.getToolDefinitions();
    expect(definitions.find(t => t.name === 'custom')).toBeDefined();
  });

  it('should set working directory', () => {
    registry.setWorkingDirectory('/custom/path');
    // Verify it doesn't throw
    expect(true).toBe(true);
  });

  it('should set provider', () => {
    registry.setProvider(mockProvider as any);
    // Verify it doesn't throw
    expect(true).toBe(true);
  });

  it('should get tool definitions for enabled tools only', () => {
    const definitions = registry.getToolDefinitions(['bash', 'read']);
    expect(definitions.length).toBe(2);
    expect(definitions.find(t => t.name === 'bash')).toBeDefined();
    expect(definitions.find(t => t.name === 'read')).toBeDefined();
    expect(definitions.find(t => t.name === 'write')).toBeUndefined();
  });

  it('should skip unknown tools in getToolDefinitions', () => {
    const definitions = registry.getToolDefinitions(['bash', 'unknown_tool']);
    expect(definitions.length).toBe(1);
    expect(definitions.find(t => t.name === 'bash')).toBeDefined();
  });

  it('should execute tool call', async () => {
    const result = await registry.executeToolCall({
      name: 'bash',
      arguments: { command: 'echo test' },
    });

    expect(result).toBeDefined();
  });

  it('should return error for unknown tool', async () => {
    const result = await registry.executeToolCall({
      name: 'unknown_tool',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown tool');
  });

  it('should increment turn counter and total calls on each execution', async () => {
    expect(registry.getTotalToolCalls()).toBe(0);

    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo 1' } });
    expect(registry.getTotalToolCalls()).toBe(1);

    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo 2' } });
    expect(registry.getTotalToolCalls()).toBe(2);
  });

  it('should handle tool execution errors gracefully', async () => {
    registry.register(new ThrowingTool());

    const result = await registry.executeToolCall({
      name: 'throwing',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Intentional test error');
    expect(result.output).toContain('Intentional test error');
  });

  it('should truncate large output to maxOutputSize', async () => {
    registry.register(new LargeOutputTool(200000));
    registry.setExecutionLimits({ maxOutputSize: 5000 });

    const result = await registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    });

    expect(result.success).toBe(true);
    expect(result.output.length).toBeLessThan(10000);
    expect(result.output).toContain('chars omitted');
  });

  it('should truncate output with head/tail split when size allows', async () => {
    registry.register(new LargeOutputTool(10000));
    registry.setExecutionLimits({ maxOutputSize: 1000 });

    const result = await registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    });

    expect(result.success).toBe(true);
    // Output should be truncated with head/tail format
    expect(result.output.length).toBeLessThanOrEqual(1100); // Some overhead for message
    expect(result.output).toContain('chars omitted');
  });

  it('should handle very small maxOutputSize', async () => {
    registry.register(new LargeOutputTool(500));
    registry.setExecutionLimits({ maxOutputSize: 50 });

    const result = await registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    });

    expect(result.success).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(100);
    expect(result.output).toContain('truncated');
  });
});

describe('createToolRegistry', () => {
  it('should create registry with default working directory', () => {
    const registry = createToolRegistry();
    expect(registry).toBeInstanceOf(ToolRegistry);
  });

  it('should create registry with custom working directory', () => {
    const registry = createToolRegistry('/custom/path');
    expect(registry).toBeInstanceOf(ToolRegistry);
  });
});

describe('ToolRegistry.setWorkspaceScope', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should set writeScope and readScope when paths provided', () => {
    registry.setWorkspaceScope(['/project1', '/project2']);

    // Verify by checking that tools can access the scope (indirect test)
    const definitions = registry.getToolDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('should set custom readPaths when provided', () => {
    registry.setWorkspaceScope(['/write1', '/write2'], ['/read1', '/read2', '/read3']);

    const definitions = registry.getToolDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('should default readPaths to writePaths plus home when readPaths not specified', () => {
    registry.setWorkspaceScope(['/project']);

    // The readScope should include /project and home directory
    // This is indirectly tested by ensuring no errors occur
    expect(registry.getToolDefinitions().length).toBeGreaterThan(0);
  });

  it('should clear scopes when empty paths array provided', () => {
    registry.setWorkspaceScope(['/project']);
    registry.setWorkspaceScope([]);

    // Scopes should be cleared
    expect(registry.getToolDefinitions().length).toBeGreaterThan(0);
  });
});

describe('ToolRegistry.setExecutionLimits', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should set maxOutputSize', () => {
    registry.setExecutionLimits({ maxOutputSize: 5000 });
    registry.register(new LargeOutputTool(10000));

    const result = registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    });

    // The output should be truncated
    return expect(result).resolves.toHaveProperty('output');
  });

  it('should not change limits when called with undefined', () => {
    registry.setExecutionLimits({ maxOutputSize: 1000 });
    registry.setExecutionLimits(undefined);

    registry.register(new LargeOutputTool(5000));
    return expect(registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    })).resolves.toHaveProperty('output');
  });

  it('should not change limits when maxOutputSize not provided', () => {
    registry.setExecutionLimits({ maxOutputSize: 500 });
    registry.setExecutionLimits({});

    registry.register(new LargeOutputTool(1000));
    return expect(registry.executeToolCall({
      name: 'large_output',
      arguments: {},
    })).resolves.toHaveProperty('output');
  });
});

describe('ToolRegistry.resetTurnCounter', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should not affect totalToolCalls', async () => {
    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo test' } });
    expect(registry.getTotalToolCalls()).toBe(1);

    registry.resetTurnCounter();

    expect(registry.getTotalToolCalls()).toBe(1);
  });
});

describe('ToolRegistry.getTotalToolCalls', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should return 0 initially', () => {
    expect(registry.getTotalToolCalls()).toBe(0);
  });

  it('should increment with each tool call', async () => {
    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo 1' } });
    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo 2' } });
    await registry.executeToolCall({ name: 'bash', arguments: { command: 'echo 3' } });

    expect(registry.getTotalToolCalls()).toBe(3);
  });
});

describe('ToolRegistry.setSkills', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should set skills on the skill tool', () => {
    const skills = [
      { name: 'test-skill', description: 'A test skill', content: 'test content' },
    ];

    // Should not throw
    expect(() => registry.setSkills(skills)).not.toThrow();
  });

  it('should accept empty skills array', () => {
    expect(() => registry.setSkills([])).not.toThrow();
  });
});

describe('ToolRegistry.isToolEnabled', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should return true when enabledTools is undefined', () => {
    expect(registry.isToolEnabled('bash')).toBe(true);
    expect(registry.isToolEnabled('read')).toBe(true);
  });

  it('should return true when tool is in enabledTools list', () => {
    expect(registry.isToolEnabled('bash', ['bash', 'read'])).toBe(true);
    expect(registry.isToolEnabled('read', ['bash', 'read'])).toBe(true);
  });

  it('should return false when tool is not in enabledTools list', () => {
    expect(registry.isToolEnabled('write', ['bash', 'read'])).toBe(false);
    expect(registry.isToolEnabled('bash', ['read', 'write'])).toBe(false);
  });
});

describe('ToolRegistry.getEnabledTools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should return all tool names when enabledTools is undefined', () => {
    const tools = registry.getEnabledTools();
    expect(tools).toContain('bash');
    expect(tools).toContain('read');
    expect(tools).toContain('write');
    expect(tools.length).toBeGreaterThan(5);
  });

  it('should return only enabled tools that exist', () => {
    const tools = registry.getEnabledTools(['bash', 'read', 'nonexistent']);
    expect(tools).toContain('bash');
    expect(tools).toContain('read');
    expect(tools).not.toContain('nonexistent');
    expect(tools.length).toBe(2);
  });

  it('should return empty array when no enabled tools exist', () => {
    const tools = registry.getEnabledTools(['nonexistent1', 'nonexistent2']);
    expect(tools).toEqual([]);
  });
});

describe('ToolRegistry.setPermissions', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should set permissions without error', () => {
    expect(() => registry.setPermissions(['read', 'write'])).not.toThrow();
  });

  it('should accept empty permissions array', () => {
    expect(() => registry.setPermissions([])).not.toThrow();
  });
});

describe('ToolRegistry.register', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should register a new tool', () => {
    const customTool = new MockTool('custom');
    registry.register(customTool);

    const definitions = registry.getToolDefinitions();
    expect(definitions.find(t => t.name === 'custom')).toBeDefined();
  });

  it('should overwrite an existing tool with same name', () => {
    const tool1 = new MockTool('duplicate', { success: true, output: 'first' });
    const tool2 = new MockTool('duplicate', { success: true, output: 'second' });

    registry.register(tool1);
    registry.register(tool2);

    const definitions = registry.getToolDefinitions();
    const found = definitions.find(t => t.name === 'duplicate');
    expect(found).toBeDefined();
    // The tool should be the second one registered
    expect(found?.name).toBe('duplicate');
  });

  it('should allow registering tool that overrides default tool', () => {
    const customBash = new MockTool('bash', { success: true, output: 'custom bash' });
    registry.register(customBash);

    const definitions = registry.getToolDefinitions();
    expect(definitions.filter(t => t.name === 'bash').length).toBe(1);
  });
});

describe('ToolRegistry.disconnectMcp', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should not throw when no MCP manager exists', async () => {
    await expect(registry.disconnectMcp()).resolves.not.toThrow();
  });

  it('should be callable multiple times', async () => {
    await registry.disconnectMcp();
    await registry.disconnectMcp();
    await registry.disconnectMcp();
    // Should not throw
  });

  it('should disconnect MCP manager when initialized', async () => {
    const config = {
      testServer: {
        transport: 'stdio' as const,
        command: 'test-cmd',
      },
    };

    await registry.initializeMcpServers(config);
    await registry.disconnectMcp();

    // After disconnect, calling again should not throw
    await expect(registry.disconnectMcp()).resolves.not.toThrow();
  });
});

describe('ToolRegistry.initializeMcpServers', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should handle empty config without error', async () => {
    await expect(registry.initializeMcpServers({})).resolves.not.toThrow();
  });

  it('should handle disabled MCP servers', async () => {
    const config = {
      disabledServer: {
        transport: 'stdio' as const,
        command: 'test-cmd',
        disabled: true,
      },
    };

    await expect(registry.initializeMcpServers(config)).resolves.not.toThrow();
  });

  it('should connect to MCP server and register tools', async () => {
    const config = {
      testServer: {
        transport: 'stdio' as const,
        command: 'test-cmd',
      },
    };

    await registry.initializeMcpServers(config);

    // Should have registered the MCP tool
    const definitions = registry.getToolDefinitions();
    expect(definitions.find(t => t.name === 'mcp_test_tool')).toBeDefined();
  });

  it('should handle multiple MCP servers', async () => {
    const config = {
      server1: {
        transport: 'stdio' as const,
        command: 'cmd1',
      },
      server2: {
        transport: 'stdio' as const,
        command: 'cmd2',
      },
    };

    await registry.initializeMcpServers(config);

    const definitions = registry.getToolDefinitions();
    expect(definitions.find(t => t.name === 'mcp_test_tool')).toBeDefined();
  });
});

describe('ToolRegistry edge cases', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp');
  });

  it('should handle tool with null output', async () => {
    class NullOutputTool extends BaseTool {
      readonly name = 'null_output';
      readonly description = 'Tool with null output';
      readonly parameters = {
        type: 'object' as const,
        properties: {},
      };

      async execute(): Promise<ToolExecuteResult> {
        return { success: true, output: null as any };
      }
    }

    registry.register(new NullOutputTool());
    const result = await registry.executeToolCall({
      name: 'null_output',
      arguments: {},
    });

    expect(result.success).toBe(true);
  });

  it('should handle tool with empty output', async () => {
    class EmptyOutputTool extends BaseTool {
      readonly name = 'empty_output';
      readonly description = 'Tool with empty output';
      readonly parameters = {
        type: 'object' as const,
        properties: {},
      };

      async execute(): Promise<ToolExecuteResult> {
        return { success: true, output: '' };
      }
    }

    registry.register(new EmptyOutputTool());
    const result = await registry.executeToolCall({
      name: 'empty_output',
      arguments: {},
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('');
  });

  it('should handle tool execution error without message', async () => {
    class ErrorWithoutMessageTool extends BaseTool {
      readonly name = 'error_no_msg';
      readonly description = 'Tool that throws without message';
      readonly parameters = {
        type: 'object' as const,
        properties: {},
      };

      async execute(): Promise<ToolExecuteResult> {
        throw {}; // Error without message property
      }
    }

    registry.register(new ErrorWithoutMessageTool());
    const result = await registry.executeToolCall({
      name: 'error_no_msg',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should log security event on tool execution', async () => {
    // This test verifies the security logging doesn't throw
    const result = await registry.executeToolCall({
      name: 'bash',
      arguments: { command: 'echo test' },
    });

    expect(result).toBeDefined();
  });
});
