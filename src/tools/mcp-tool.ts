import { BaseTool } from './base.js';
import type { ToolExecuteResult, ToolContext } from './base.js';
import type { ToolParameters } from '../providers/base.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

interface McpContentBlock {
  type: string;
  text?: string;
}

export class McpServerTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;

  private client: Client;
  private serverName: string;
  private toolName: string;

  constructor(
    serverName: string,
    toolName: string,
    description: string,
    inputSchema: ToolParameters,
    client: Client,
    toolPrefix?: string,
  ) {
    super();
    const prefix = toolPrefix || serverName;
    this.name = `mcp:${prefix}:${toolName}`;
    this.description = description || `MCP tool "${toolName}" from server "${serverName}"`;
    this.parameters = inputSchema;
    this.client = client;
    this.serverName = serverName;
    this.toolName = toolName;
  }

  async execute(params: Record<string, unknown>, _context?: ToolContext): Promise<ToolExecuteResult> {
    try {
      const result = await this.client.callTool({
        name: this.toolName,
        arguments: params,
      });

      const content = result.content as McpContentBlock[];

      if (result.isError) {
        const errorText = content
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('\n');
        return {
          success: false,
          output: '',
          error: errorText || `MCP tool "${this.toolName}" returned an error`,
        };
      }

      if (result.structuredContent && Object.keys(result.structuredContent as Record<string, unknown>).length > 0) {
        return {
          success: true,
          output: JSON.stringify(result.structuredContent, null, 2),
        };
      }

      const output = content
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n');

      return {
        success: true,
        output: output || `Tool "${this.toolName}" completed successfully`,
      };
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `MCP tool "${this.toolName}" failed: ${err.message}`,
      };
    }
  }
}
