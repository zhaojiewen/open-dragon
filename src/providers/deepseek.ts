import OpenAI from 'openai';
import {
  BaseProvider,
  Message,
  ToolDefinition,
  ChatOptions,
  AIResponse,
  StreamChunk,
  ToolCall,
} from './base.js';

export class DeepSeekProvider extends BaseProvider {
  readonly name = 'deepseek';
  protected apiKey: string;
  protected baseUrl?: string;
  protected models: string[];
  protected defaultModel: string;
  private client: OpenAI;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    models?: string[];
    defaultModel?: string;
  }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    this.models = config.models || ['deepseek-chat', 'deepseek-reasoner'];
    this.defaultModel = config.defaultModel || 'deepseek-chat';
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    const formattedMessages = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    const response = await this.client.chat.completions.create(requestParams);

    const choice = response.choices[0];
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content: choice.message.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  async *stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const formattedMessages = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }

    const stream = await this.client.chat.completions.create(requestParams);

    let currentToolCall: Partial<ToolCall> = {};
    let currentToolArgs = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            if (currentToolCall.id) {
              yield {
                type: 'tool_use',
                toolCall: {
                  ...currentToolCall,
                  arguments: JSON.parse(currentToolArgs),
                },
                isComplete: true,
              };
            }
            currentToolCall = { id: tc.id, name: tc.function?.name };
            currentToolArgs = '';
          }
          if (tc.function?.arguments) {
            currentToolArgs += tc.function.arguments;
          }
          if (tc.function?.name) {
            currentToolCall.name = tc.function.name;
          }
        }
      }
    }

    if (currentToolCall.id) {
      yield {
        type: 'tool_use',
        toolCall: {
          ...currentToolCall,
          arguments: JSON.parse(currentToolArgs),
        },
        isComplete: true,
      };
    }
  }

  private formatMessages(
    messages: Message[],
    systemPrompt?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const formatted: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        formatted.push({ role: 'system', content: typeof msg.content === 'string' ? msg.content : '' });
      } else if (msg.role === 'user') {
        formatted.push({ role: 'user', content: typeof msg.content === 'string' ? msg.content : '' });
      } else if (msg.role === 'assistant') {
        formatted.push({ role: 'assistant', content: typeof msg.content === 'string' ? msg.content : '' });
      } else if (msg.role === 'tool') {
        formatted.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || '',
          content: typeof msg.content === 'string' ? msg.content : '',
        });
      }
    }

    return formatted;
  }
}
