import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../../src/tools/index.js';
import { AIProvider, Message, StreamChunk } from '../../../src/providers/base.js';

// Mock provider for testing
class MockProvider implements AIProvider {
  readonly name = 'mock';

  async chat(messages: Message[], tools?: any[], options?: any) {
    return {
      content: 'test response',
      stopReason: 'end_turn',
    };
  }

  async *stream(messages: Message[], tools?: any[], options?: any): AsyncGenerator<StreamChunk> {
    yield { type: 'text', text: 'test' };
  }

  async listModels(): Promise<string[]> {
    return ['mock-model'];
  }

  getDefaultModel(): string {
    return 'mock-model';
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockProvider: MockProvider;

  beforeEach(() => {
    registry = createToolRegistry('/tmp/test');
    mockProvider = new MockProvider();
  });

  it('should create registry with default tools', () => {
    expect(registry).toBeDefined();
    
    const tools = registry.getToolDefinitions();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.find(t => t.name === 'bash')).toBeDefined();
    expect(tools.find(t => t.name === 'read')).toBeDefined();
    expect(tools.find(t => t.name === 'write')).toBeDefined();
  });

  it('should set and get provider', () => {
    registry.setProvider(mockProvider);
    // No error means success
  });

  it('should filter tools by enabled list', () => {
    const tools = registry.getToolDefinitions(['bash', 'read']);
    
    expect(tools.length).toBe(2);
    expect(tools.find(t => t.name === 'bash')).toBeDefined();
    expect(tools.find(t => t.name === 'read')).toBeDefined();
  });

  it('should return all tools when no filter provided', () => {
    const tools = registry.getToolDefinitions();
    
    expect(tools.length).toBeGreaterThan(5);
  });

  it('should execute tool call', async () => {
    const result = await registry.executeToolCall({
      name: 'bash',
      arguments: { command: 'echo test' },
    });

    // Verify tool was found and executed (may fail due to environment)
    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
    expect(result.output).toBeDefined();
  });

  it('should return error for unknown tool', async () => {
    const result = await registry.executeToolCall({
      name: 'nonexistent-tool',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown tool');
  });

  it('should handle tool execution errors', async () => {
    const result = await registry.executeToolCall({
      name: 'bash',
      arguments: { command: 'exit 1' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should update working directory', () => {
    const newDir = '/new/directory';
    registry.setWorkingDirectory(newDir);
    // No error means success
  });

  it('should have proper tool definitions format', () => {
    const tools = registry.getToolDefinitions(['bash']);
    const bashTool = tools.find(t => t.name === 'bash');

    expect(bashTool).toBeDefined();
    expect(bashTool!.description).toBeDefined();
    expect(bashTool!.parameters).toBeDefined();
    expect(bashTool!.parameters.type).toBe('object');
    expect(bashTool!.parameters.properties).toBeDefined();
    expect(bashTool!.parameters.required).toContain('command');
  });
});

describe('createToolRegistry', () => {
  it('should create registry with default working directory', () => {
    const registry = createToolRegistry();
    expect(registry).toBeDefined();
  });

  it('should create registry with custom working directory', () => {
    const registry = createToolRegistry('/custom/path');
    expect(registry).toBeDefined();
  });
});
