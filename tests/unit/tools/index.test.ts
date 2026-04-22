import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../../src/tools/index.js';
import { BaseTool } from '../../../src/tools/base.js';

// Mock provider
const mockProvider = {
  name: 'mock',
  chat: vi.fn(),
  stream: vi.fn(),
};

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
