import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool } from './edit.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { WebFetchTool } from './webfetch.js';
import { WebSearchTool } from './websearch.js';
import { AgentTool } from './agent.js';
import { ToolDefinition } from '../providers/base.js';
import { AIProvider } from '../providers/index.js';

export * from './base.js';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private context: ToolContext;
  private provider: AIProvider | null = null;

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

  async executeToolCall(
    toolCall: { name: string; arguments: Record<string, unknown> }
  ): Promise<ToolExecuteResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: ${toolCall.name}`,
        error: 'Unknown tool',
      };
    }

    return tool.execute(toolCall.arguments, this.context);
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
