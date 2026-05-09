import { BaseTool } from './base.js';
import type { ToolExecuteResult, ToolContext } from './base.js';
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool } from './edit.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { WebFetchTool } from './webfetch.js';
import { WebSearchTool } from './websearch.js';
import { AgentTool } from './agent.js';
import type { ToolDefinition } from '../providers/base.js';
import type { AIProvider } from '../providers/index.js';
import { SkillTool } from '../skills/skill-tool.js';
import type { SkillDefinition } from '../skills/types.js';
import { McpClientManager } from './mcp-client.js';
import type { McpServerConfig } from '../config/schema.js';
import * as os from 'os';

export * from './base.js';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private context: ToolContext;
  private provider: AIProvider | null = null;
  private totalToolCalls: number = 0;
  private maxOutputSize: number = 100000;
  private toolCallCountThisTurn: number = 0;
  private skillTool: SkillTool;
  private mcpManager: McpClientManager | null = null;

  constructor(workingDirectory: string = process.cwd()) {
    this.context = { workingDirectory };
    this.skillTool = new SkillTool();
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    this.register(new BashTool());
    this.register(new ReadTool());
    this.register(new WriteTool());
    this.register(new EditTool());
    this.register(new GlobTool());
    this.register(new GrepTool());
    this.register(new WebFetchTool());
    this.register(new WebSearchTool());
    this.register(new AgentTool());
    this.register(this.skillTool);
  }

  register(tool: BaseTool) {
    this.tools.set(tool.name, tool);
  }

  setProvider(provider: AIProvider) {
    this.provider = provider;
    const agentTool = this.tools.get('agent') as AgentTool | undefined;
    if (agentTool) {
      agentTool.setProvider(provider);
    }
  }

  setWorkingDirectory(dir: string) {
    this.context.workingDirectory = dir;
  }

  setPermissions(permissions: string[]) {
    this.context.permissions = permissions;
  }

  /**
   * Set workspace scope paths for read and write operations.
   * @param paths - Workspace root paths for write operations
   * @param readPaths - Additional paths for read operations (defaults to paths + home)
   */
  setWorkspaceScope(paths: string[], readPaths?: string[]) {
    if (paths.length > 0) {
      this.context.writeScope = paths;
      this.context.readScope = readPaths || [
        ...paths,
        ...(process.env.HOME ? [process.env.HOME] : [os.homedir()]),
      ];
      this.context.allowedPaths = paths; // backward compat
    } else {
      this.context.writeScope = undefined;
      this.context.readScope = undefined;
      this.context.allowedPaths = undefined;
    }
  }

  setExecutionLimits(limits?: { maxOutputSize?: number }) {
    if (limits?.maxOutputSize) this.maxOutputSize = limits.maxOutputSize;
  }

  /**
   * Update the skills list in the SkillTool (called when skills are loaded/reloaded).
   */
  setSkills(skills: SkillDefinition[]) {
    this.skillTool.setSkills(skills);
  }

  /**
   * Initialize MCP servers — connects to configured servers, discovers tools,
   * and registers them as McpServerTool wrappers.
   */
  async initializeMcpServers(mcpServers: Record<string, McpServerConfig>): Promise<void> {
    this.mcpManager = new McpClientManager();
    await this.mcpManager.connect(mcpServers);
    for (const tool of this.mcpManager.getTools()) {
      this.register(tool);
    }
  }

  /**
   * Disconnect all MCP server connections. Call before shutdown.
   */
  async disconnectMcp(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.disconnect();
      this.mcpManager = null;
    }
  }

  resetTurnCounter() {
    this.toolCallCountThisTurn = 0;
  }

  getTotalToolCalls(): number {
    return this.totalToolCalls;
  }

  getToolDefinitions(enabledTools?: string[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    const tools = enabledTools || Array.from(this.tools.keys());

    for (const name of tools) {
      const tool = this.tools.get(name);
      if (tool) {
        result.push(tool.getDefinition());
      }
    }
    return result;
  }

  isToolEnabled(toolName: string, enabledTools?: string[]): boolean {
    if (!enabledTools) return true;
    return enabledTools.includes(toolName);
  }

  getEnabledTools(enabledTools?: string[]): string[] {
    if (!enabledTools) return Array.from(this.tools.keys());
    return enabledTools.filter(name => this.tools.has(name));
  }

  private truncateOutput(output: string): string {
    if (this.maxOutputSize < 200) {
      return output.substring(0, this.maxOutputSize) +
        `\n... (output truncated at ${this.maxOutputSize} chars)`;
    }

    const headSize = Math.floor(this.maxOutputSize * 0.6);
    const tailSize = Math.floor(this.maxOutputSize * 0.35);
    const omitted = output.length - headSize - tailSize;

    const head = output.substring(0, headSize);
    const tail = output.substring(output.length - tailSize);
    const notice = `\n... [${omitted.toLocaleString()} chars omitted] ...\n`;

    return head + notice + tail;
  }

  async executeToolCall(
    toolCall: { name: string; arguments: Record<string, unknown> }
  ): Promise<ToolExecuteResult> {
    this.toolCallCountThisTurn++;
    this.totalToolCalls++;

    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: ${toolCall.name}`,
        error: 'Unknown tool',
      };
    }

    const logger = (await import('../utils/logger.js')).getLogger();
    logger.security('tool_executed', {
      tool: toolCall.name,
      workingDirectory: this.context.workingDirectory,
    });

    let result: ToolExecuteResult;
    try {
      result = await tool.execute(toolCall.arguments, this.context);
    } catch (error: any) {
      result = {
        success: false,
        output: error.message || `Tool execution failed: ${toolCall.name}`,
        error: error.message || 'Tool execution failed',
      };
    }

    if (result.output && result.output.length > this.maxOutputSize) {
      result.output = this.truncateOutput(result.output);
    }

    return result;
  }
}

export function createToolRegistry(workingDirectory?: string): ToolRegistry {
  return new ToolRegistry(workingDirectory);
}

export {
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  WebSearchTool,
  AgentTool,
};

export { McpServerTool } from './mcp-tool.js';
