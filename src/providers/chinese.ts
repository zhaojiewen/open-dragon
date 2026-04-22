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

const CHINESE_PROVIDERS: Record<string, { baseUrl: string; models: string[]; defaultModel: string }> = {
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
    defaultModel: 'qwen-max',
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-8k',
  },
  yi: {
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    models: ['yi-lightning', 'yi-large', 'yi-medium'],
    defaultModel: 'yi-lightning',
  },
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-4k', 'doubao-pro-32k', 'doubao-pro-128k'],
    defaultModel: 'doubao-pro-4k',
  },
};

export class ChineseProvider extends BaseProvider {
  readonly name: string;
  protected apiKey: string;
  protected baseUrl?: string;
  protected models: string[];
  protected defaultModel: string;
  private client: OpenAI;

  constructor(config: {
    name: string;
    apiKey: string;
    baseUrl?: string;
    models?: string[];
    defaultModel?: string;
  }) {
    super();
    this.name = config.name;

    const providerConfig = CHINESE_PROVIDERS[config.name] || {
      baseUrl: config.baseUrl || '',
      models: [],
      defaultModel: '',
    };

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || providerConfig.baseUrl;
    this.models = config.models || providerConfig.models;
    this.defaultModel = config.defaultModel || providerConfig.defaultModel;

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

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }
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
      }
    }

    return formatted;
  }
}

export { CHINESE_PROVIDERS };
