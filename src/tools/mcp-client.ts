import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpServerTool } from './mcp-tool.js';
import type { BaseTool } from './base.js';
import type { McpServerConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const logger = getLogger();

interface ServerConnection {
  client: Client;
  serverName: string;
  config: McpServerConfig;
}

export class McpClientManager {
  private connections: ServerConnection[] = [];
  private tools: McpServerTool[] = [];

  async connect(configs: Record<string, McpServerConfig>): Promise<void> {
    for (const [serverName, config] of Object.entries(configs)) {
      if (config.disabled) continue;

      try {
        const transport = this.createTransport(serverName, config);
        const client = new Client(
          { name: 'dragon', version },
          { capabilities: {} },
        );

        await client.connect(transport);
        logger.info(`Connected to MCP server "${serverName}"`);

        this.connections.push({ client, serverName, config });

        try {
          const { tools } = await client.listTools();
          logger.info(`Discovered ${tools.length} tools from MCP server "${serverName}"`);

          for (const tool of tools) {
            const wrapped = new McpServerTool(
              serverName,
              tool.name,
              tool.description || '',
              {
                type: 'object' as const,
                properties: (tool.inputSchema?.properties as Record<string, any>) || {},
                required: tool.inputSchema?.required as string[] | undefined,
              },
              client,
              config.toolPrefix,
            );
            this.tools.push(wrapped);
          }
        } catch (err: any) {
          try { await client.close(); } catch { /* ignore close errors */ }
          this.connections = this.connections.filter(c => c.serverName !== serverName);
          logger.warn(`Failed to list tools from MCP server "${serverName}": ${err.message}`);
        }
      } catch (err: any) {
        logger.warn(`Failed to connect to MCP server "${serverName}": ${err.message}`);
      }
    }

    logger.info(`MCP: ${this.tools.length} total tools from ${this.connections.length} servers`);
  }

  getTools(): BaseTool[] {
    return this.tools;
  }

  async disconnect(): Promise<void> {
    for (const conn of this.connections) {
      try {
        await conn.client.close();
      } catch {
        // Ignore close errors
      }
    }
    this.connections = [];
    this.tools = [];
  }

  private createTransport(serverName: string, config: McpServerConfig) {
    switch (config.transport) {
      case 'streamableHttp': {
        if (!config.url) {
          throw new Error(`MCP server "${serverName}": "url" is required for streamableHttp transport`);
        }
        return new StreamableHTTPClientTransport(new URL(config.url));
      }
      case 'sse': {
        if (!config.url) {
          throw new Error(`MCP server "${serverName}": "url" is required for sse transport`);
        }
        return new SSEClientTransport(new URL(config.url));
      }
      case 'stdio':
      default: {
        if (!config.command) {
          throw new Error(`MCP server "${serverName}": "command" is required for stdio transport`);
        }
        const opts: { command: string; args?: string[]; env?: Record<string, string> } = {
          command: config.command,
        };
        if (config.args && config.args.length > 0) opts.args = config.args;
        if (config.env && Object.keys(config.env).length > 0) opts.env = config.env;
        return new StdioClientTransport(opts);
      }
    }
  }
}
