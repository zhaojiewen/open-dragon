import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServerTool } from '../../../src/tools/mcp-tool.js';

function createMockClient(callToolImpl: any) {
  return {
    callTool: vi.fn().mockImplementation(callToolImpl),
  } as any;
}

describe('McpServerTool', () => {
  describe('constructor', () => {
    it('should use server name as prefix by default', () => {
      const tool = new McpServerTool(
        'my-server',
        'read_file',
        'Read a file from the filesystem',
        { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        createMockClient(() => {}),
      );

      expect(tool.name).toBe('mcp:my-server:read_file');
      expect(tool.description).toBe('Read a file from the filesystem');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toEqual({ path: { type: 'string' } });
      expect(tool.parameters.required).toEqual(['path']);
    });

    it('should use toolPrefix when provided', () => {
      const tool = new McpServerTool(
        'my-server',
        'read_file',
        '',
        { type: 'object', properties: {}, required: [] },
        createMockClient(() => {}),
        'custom-prefix',
      );

      expect(tool.name).toBe('mcp:custom-prefix:read_file');
    });

    it('should generate description when empty', () => {
      const tool = new McpServerTool(
        'my-server',
        'some_tool',
        '',
        { type: 'object', properties: {}, required: [] },
        createMockClient(() => {}),
      );

      expect(tool.description).toContain('"some_tool"');
      expect(tool.description).toContain('"my-server"');
    });
  });

  describe('execute', () => {
    it('should return text content on success', async () => {
      const client = createMockClient(async () => ({
        content: [{ type: 'text', text: 'Hello from MCP tool' }],
        isError: false,
      }));

      const tool = new McpServerTool(
        'srv', 'echo', 'Echo tool',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({ message: 'hello' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello from MCP tool');
      expect(client.callTool).toHaveBeenCalledWith({
        name: 'echo',
        arguments: { message: 'hello' },
      });
    });

    it('should return structuredContent as JSON', async () => {
      const client = createMockClient(async () => ({
        content: [{ type: 'text', text: 'ignored' }],
        structuredContent: { result: 42, items: ['a', 'b'] },
        isError: false,
      }));

      const tool = new McpServerTool(
        'srv', 'query', 'Query tool',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.output);
      expect(parsed).toEqual({ result: 42, items: ['a', 'b'] });
    });

    it('should return error when isError is true', async () => {
      const client = createMockClient(async () => ({
        content: [{ type: 'text', text: 'Something went wrong' }],
        isError: true,
      }));

      const tool = new McpServerTool(
        'srv', 'failing_tool', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Something went wrong');
    });

    it('should return fallback error message when isError has empty content', async () => {
      const client = createMockClient(async () => ({
        content: [],
        isError: true,
      }));

      const tool = new McpServerTool(
        'srv', 'failing_tool', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP tool "failing_tool" returned an error');
    });

    it('should return fallback success message when content is empty', async () => {
      const client = createMockClient(async () => ({
        content: [],
        isError: false,
      }));

      const tool = new McpServerTool(
        'srv', 'no_output_tool', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.output).toBe('Tool "no_output_tool" completed successfully');
    });

    it('should handle callTool throwing an exception', async () => {
      const client = createMockClient(async () => {
        throw new Error('Connection lost');
      });

      const tool = new McpServerTool(
        'srv', 'crash_tool', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection lost');
      expect(result.error).toContain('"crash_tool" failed');
    });

    it('should filter non-text content blocks', async () => {
      const client = createMockClient(async () => ({
        content: [
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'Only text matters' },
          { type: 'resource', uri: 'file:///tmp/data' },
        ],
        isError: false,
      }));

      const tool = new McpServerTool(
        'srv', 'mixed', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.output).toBe('Only text matters');
    });

    it('should join multiple text blocks with newlines', async () => {
      const client = createMockClient(async () => ({
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
          { type: 'text', text: 'Line 3' },
        ],
        isError: false,
      }));

      const tool = new McpServerTool(
        'srv', 'multiline', '',
        { type: 'object', properties: {}, required: [] },
        client,
      );

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.output).toBe('Line 1\nLine 2\nLine 3');
    });
  });
});
