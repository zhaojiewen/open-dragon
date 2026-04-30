import { z } from 'zod';

export const ToolParameterSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.any()),
  required: z.array(z.string()).optional(),
});

export type ToolParameters = z.infer<typeof ToolParameterSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  toolCallId?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  content?: string;
  isError?: boolean;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'model_context_window_exceeded' | 'pause_turn';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
}

export interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'usage';
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  toolCall?: Partial<ToolCall>;
  isComplete?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
}

export interface AIProvider {
  readonly name: string;
  chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse>;
  stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk>;
  listModels(): Promise<string[]>;
  getDefaultModel(): string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  thinking?: boolean | { type: 'adaptive'; display?: 'summarized' | 'omitted' };
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  cacheControl?: boolean;
  tokenSaveMode?: boolean;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract apiKey: string;
  protected abstract baseUrl?: string;
  protected abstract models: string[];
  protected abstract defaultModel: string;

  abstract chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse>;

  abstract stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk>;

  async listModels(): Promise<string[]> {
    return this.models;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  protected buildToolDefinitions(tools: ToolDefinition[]): unknown {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
}
