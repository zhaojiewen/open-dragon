import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpClientManager } from '../../../src/tools/mcp-client.js';
import type { McpServerConfig } from '../../../src/config/schema.js';

// Mock MCP SDK modules — variables must be hoisted since vi.mock is hoisted
const { MockClient, MockStdioTransport, MockSSETransport, MockStreamableHttpTransport } = vi.hoisted(() => ({
  MockClient: vi.fn(),
  MockStdioTransport: vi.fn(),
  MockSSETransport: vi.fn(),
  MockStreamableHttpTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: MockClient,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: MockStdioTransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: MockSSETransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: MockStreamableHttpTransport,
}));

function createMockClient(overrides: any = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(),
    ...overrides,
  };
}

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new McpClientManager();
  });

  describe('connect', () => {
    it('should connect to a stdio server and discover tools', async () => {
      const mockClient = createMockClient({
        listTools: vi.fn().mockResolvedValue({
          tools: [
            { name: 'read_file', description: 'Read a file', inputSchema: { properties: { path: { type: 'string' } } } },
            { name: 'write_file', description: 'Write a file', inputSchema: { properties: {} } },
          ],
        }),
      });
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'filesystem': {
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      };

      await manager.connect(configs);

      expect(MockStdioTransport).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
      });
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.listTools).toHaveBeenCalledTimes(1);

      const tools = manager.getTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('mcp:filesystem:read_file');
      expect(tools[1].name).toBe('mcp:filesystem:write_file');
    });

    it('should skip disabled servers', async () => {
      const configs: Record<string, McpServerConfig> = {
        'filesystem': {
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          disabled: true,
        },
      };

      await manager.connect(configs);

      expect(MockClient).not.toHaveBeenCalled();
      expect(manager.getTools()).toHaveLength(0);
    });

    it('should handle multiple servers', async () => {
      const client1 = createMockClient({
        listTools: vi.fn().mockResolvedValue({
          tools: [{ name: 'tool_a', description: '', inputSchema: { properties: {} } }],
        }),
      });
      const client2 = createMockClient({
        listTools: vi.fn().mockResolvedValue({
          tools: [{ name: 'tool_b', description: '', inputSchema: { properties: {} } }],
        }),
      });
      MockClient
        .mockImplementationOnce(function() { return client1; })
        .mockImplementationOnce(function() { return client2; });

      const configs: Record<string, McpServerConfig> = {
        'server1': { transport: 'stdio', command: 'cmd1' },
        'server2': { transport: 'stdio', command: 'cmd2' },
      };

      await manager.connect(configs);

      const tools = manager.getTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('mcp:server1:tool_a');
      expect(tools[1].name).toBe('mcp:server2:tool_b');
    });

    it('should use toolPrefix when provided', async () => {
      const mockClient = createMockClient({
        listTools: vi.fn().mockResolvedValue({
          tools: [{ name: 'my_tool', description: '', inputSchema: { properties: {} } }],
        }),
      });
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'server1': {
          transport: 'stdio',
          command: 'cmd',
          toolPrefix: 'short',
        },
      };

      await manager.connect(configs);

      expect(manager.getTools()[0].name).toBe('mcp:short:my_tool');
    });

    it('should continue on connect failure', async () => {
      MockClient
        .mockImplementationOnce(function() { throw new Error('Connection refused'); })
        .mockImplementationOnce(function() {
          return createMockClient({
            listTools: vi.fn().mockResolvedValue({
              tools: [{ name: 'tool_ok', description: '', inputSchema: { properties: {} } }],
            }),
          });
        });

      const configs: Record<string, McpServerConfig> = {
        'bad': { transport: 'stdio', command: 'bad' },
        'good': { transport: 'stdio', command: 'good' },
      };

      await manager.connect(configs);

      const tools = manager.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('mcp:good:tool_ok');
    });

    it('should clean up connection when listTools fails after connect', async () => {
      const mockClient = createMockClient();
      mockClient.listTools = vi.fn().mockRejectedValue(new Error('Server error after connect'));
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'flaky': { transport: 'stdio', command: 'flaky' },
      };

      await manager.connect(configs);

      // Tools should be empty (connection was removed from internal array)
      expect(manager.getTools()).toHaveLength(0);
      // Client should be closed to avoid resource leaks
      expect(mockClient.close).toHaveBeenCalledTimes(1);

      // disconnect should be safe even though connection was already cleaned
      await manager.disconnect();
    });

    it('should throw when streamableHttp URL is missing', async () => {
      const configs: Record<string, McpServerConfig> = {
        'bad': { transport: 'streamableHttp' },
      };

      await manager.connect(configs);

      expect(MockClient).not.toHaveBeenCalled();
      expect(manager.getTools()).toHaveLength(0);
    });

    it('should throw when sse URL is missing', async () => {
      const configs: Record<string, McpServerConfig> = {
        'bad': { transport: 'sse' },
      };

      await manager.connect(configs);

      expect(MockClient).not.toHaveBeenCalled();
      expect(manager.getTools()).toHaveLength(0);
    });

    it('should throw when stdio command is missing', async () => {
      const configs: Record<string, McpServerConfig> = {
        'bad': { transport: 'stdio' },
      };

      await manager.connect(configs);

      expect(MockClient).not.toHaveBeenCalled();
      expect(manager.getTools()).toHaveLength(0);
    });

    it('should connect to streamableHttp server', async () => {
      const mockClient = createMockClient();
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'http-server': {
          transport: 'streamableHttp',
          url: 'https://example.com/mcp',
        },
      };

      await manager.connect(configs);

      expect(MockStreamableHttpTransport).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should connect to sse server', async () => {
      const mockClient = createMockClient();
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'sse-server': {
          transport: 'sse',
          url: 'https://example.com/sse',
        },
      };

      await manager.connect(configs);

      expect(MockSSETransport).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should close all connections', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      MockClient
        .mockImplementationOnce(function() { return client1; })
        .mockImplementationOnce(function() { return client2; });

      const configs: Record<string, McpServerConfig> = {
        'a': { transport: 'stdio', command: 'a' },
        'b': { transport: 'stdio', command: 'b' },
      };

      await manager.connect(configs);
      await manager.disconnect();

      expect(client1.close).toHaveBeenCalledTimes(1);
      expect(client2.close).toHaveBeenCalledTimes(1);
      expect(manager.getTools()).toHaveLength(0);
    });

    it('should ignore close errors', async () => {
      const mockClient = createMockClient({
        close: vi.fn().mockRejectedValue(new Error('Already closed')),
      });
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'a': { transport: 'stdio', command: 'a' },
      };

      await manager.connect(configs);
      // Should not throw
      await manager.disconnect();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const mockClient = createMockClient();
      MockClient.mockImplementation(function() { return mockClient; });

      const configs: Record<string, McpServerConfig> = {
        'a': { transport: 'stdio', command: 'a' },
      };

      await manager.connect(configs);
      await manager.disconnect();
      await manager.disconnect(); // Should not throw
    });
  });
});
