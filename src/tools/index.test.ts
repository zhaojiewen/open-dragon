import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from './index.js';
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry('/test/dir');
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('constructor', () => {
    it('should register default tools', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions.length).toBeGreaterThan(0);
      expect(definitions.find(t => t.name === 'bash')).toBeDefined();
      expect(definitions.find(t => t.name === 'read')).toBeDefined();
      expect(definitions.find(t => t.name === 'write')).toBeDefined();
    });
  });

  describe('register', () => {
    it('should register a custom tool', () => {
      const customTool = new BashTool();
      registry.register(customTool);
      
      const definitions = registry.getToolDefinitions(['bash']);
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('bash');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return all tool definitions when no filter', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions.length).toBe(9); // 9 default tools
    });

    it('should filter tools by enabled list', () => {
      const definitions = registry.getToolDefinitions(['bash', 'read']);
      expect(definitions).toHaveLength(2);
      expect(definitions.map(t => t.name)).toEqual(['bash', 'read']);
    });

    it('should exclude unregistered tools', () => {
      const definitions = registry.getToolDefinitions(['bash', 'nonexistent']);
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('bash');
    });
  });

  describe('executeToolCall', () => {
    it('should return error for unknown tool', async () => {
      const result = await registry.executeToolCall({
        name: 'unknown_tool',
        arguments: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('setWorkingDirectory', () => {
    it('should update working directory', () => {
      registry.setWorkingDirectory('/new/dir');
      // The working directory is used in tool execution context
      // We can verify it by checking that the registry doesn't throw
      expect(() => registry.setWorkingDirectory('/another/dir')).not.toThrow();
    });
  });
});

describe('BashTool', () => {
  let tool: BashTool;

  beforeEach(() => {
    tool = new BashTool();
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('bash');
  });

  it('should have description', () => {
    expect(tool.description).toBeDefined();
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    expect(tool.parameters).toBeDefined();
    expect(tool.parameters.type).toBe('object');
    expect(tool.parameters.properties.command).toBeDefined();
  });

  it('should execute simple command', async () => {
    const result = await tool.execute({ command: 'echo "test"' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('test');
  });

  it('should fail on invalid command', async () => {
    const result = await tool.execute({ command: 'nonexistent_command_xyz' });
    expect(result.success).toBe(false);
  });
});

describe('ReadTool', () => {
  let tool: ReadTool;

  beforeEach(() => {
    tool = new ReadTool();
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('read');
  });

  it('should have parameters schema', () => {
    expect(tool.parameters.properties.file_path).toBeDefined();
  });
});

describe('WriteTool', () => {
  let tool: WriteTool;

  beforeEach(() => {
    tool = new WriteTool();
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('write');
  });

  it('should have parameters schema', () => {
    expect(tool.parameters.properties.file_path).toBeDefined();
    expect(tool.parameters.properties.content).toBeDefined();
  });
});
