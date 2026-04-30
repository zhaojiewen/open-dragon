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

export * from './base.js';

// Per-tool-type limits: bash is the most dangerous, read-only tools get higher limits
const PER_TOOL_SESSION_LIMITS: Record<string, number> = {
  bash: 50,
  write: 100,
  edit: 100,
  agent: 10,
  webfetch: 50,
  websearch: 50,
};

const DEFAULT_PER_TOOL_LIMIT = 200;

// Danger-level categories for tool call gating
const DANGEROUS_TOOLS = new Set(['bash', 'write', 'edit']);
const NETWORK_TOOLS = new Set(['webfetch', 'websearch']);

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private context: ToolContext;
  private provider: AIProvider | null = null;
  private totalToolCalls: number = 0;
  private maxTotalToolCalls: number = 200;
  private maxToolCallsPerTurn: number = 25;
  private maxOutputSize: number = 100000;
  private toolCallCountThisTurn: number = 0;
  private perToolCallCounts: Map<string, number> = new Map();
  private networkCallsThisTurn: number = 0;
  private maxNetworkCallsPerTurn: number = 10;

  constructor(workingDirectory: string = process.cwd()) {
    this.context = { workingDirectory };
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
  }

  register(tool: BaseTool) {
    this.tools.set(tool.name, tool);
  }

  setProvider(provider: AIProvider) {
    this.provider = provider;
    // Set provider for AgentTool if present
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
        ...(process.env.HOME ? [process.env.HOME] : []),
      ];
      this.context.allowedPaths = paths; // backward compat
    }
  }

  setExecutionLimits(limits?: { maxToolCallsPerTurn?: number; maxTotalToolCalls?: number; maxOutputSize?: number }) {
    if (limits?.maxToolCallsPerTurn) this.maxToolCallsPerTurn = limits.maxToolCallsPerTurn;
    if (limits?.maxTotalToolCalls) this.maxTotalToolCalls = limits.maxTotalToolCalls;
    if (limits?.maxOutputSize) this.maxOutputSize = limits.maxOutputSize;
  }

  resetTurnCounter() {
    this.toolCallCountThisTurn = 0;
    this.networkCallsThisTurn = 0;
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

  async executeToolCall(
    toolCall: { name: string; arguments: Record<string, unknown> }
  ): Promise<ToolExecuteResult> {
    this.toolCallCountThisTurn++;
    this.totalToolCalls++;

    // Check per-turn limit
    if (this.toolCallCountThisTurn > this.maxToolCallsPerTurn) {
      return {
        success: false,
        output: `Tool call limit reached: max ${this.maxToolCallsPerTurn} tool calls per turn.`,
        error: 'Per-turn tool call limit exceeded',
      };
    }

    // Check total session limit
    if (this.totalToolCalls > this.maxTotalToolCalls) {
      return {
        success: false,
        output: `Session tool call limit reached: max ${this.maxTotalToolCalls} tool calls.`,
        error: 'Session tool call limit exceeded',
      };
    }

    // Check per-tool-type session limits
    const toolLimit = PER_TOOL_SESSION_LIMITS[toolCall.name] ?? DEFAULT_PER_TOOL_LIMIT;
    const toolCalls = (this.perToolCallCounts.get(toolCall.name) || 0) + 1;
    this.perToolCallCounts.set(toolCall.name, toolCalls);

    if (toolCalls > toolLimit) {
      return {
        success: false,
        output: `Tool "${toolCall.name}" limit reached: max ${toolLimit} calls per session.`,
        error: 'Per-tool session limit exceeded',
      };
    }

    // Check network tool per-turn limit
    if (NETWORK_TOOLS.has(toolCall.name)) {
      this.networkCallsThisTurn++;
      if (this.networkCallsThisTurn > this.maxNetworkCallsPerTurn) {
        return {
          success: false,
          output: `Network tool call limit reached: max ${this.maxNetworkCallsPerTurn} per turn.`,
          error: 'Network tool call limit exceeded',
        };
      }
    }

    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: ${toolCall.name}`,
        error: 'Unknown tool',
      };
    }

    // Log tool execution for security (without potentially sensitive arguments)
    const logger = (await import('../utils/logger.js')).getLogger();
    logger.security('tool_executed', {
      tool: toolCall.name,
      workingDirectory: this.context.workingDirectory,
    });

    const result = await tool.execute(toolCall.arguments, this.context);

    // Truncate output if too large
    if (result.output && result.output.length > this.maxOutputSize) {
      result.output = result.output.substring(0, this.maxOutputSize) +
        `\n... (output truncated at ${this.maxOutputSize} chars)`;
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
