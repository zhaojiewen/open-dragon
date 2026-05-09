import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import type {
  Message,
  ToolDefinition,
  ChatOptions,
  AIResponse,
  StreamChunk,
  ToolCall,
} from './base.js';
import { ApiKeyMissingError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

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

    // Validate API key
    const placeholderKey = `YOUR_${config.name.toUpperCase()}_API_KEY`;
    if (!config.apiKey || config.apiKey === placeholderKey) {
      throw new ApiKeyMissingError(config.name);
    }

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
      temperature: 0.7,
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
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        } catch (parseError) {
          logger.warn(`Failed to parse tool call arguments for ${tc.function.name}`, {
            toolCallId: tc.id,
            arguments: tc.function.arguments.substring(0, 100),
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: {},
          });
        }
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
      temperature: 0.7,
      stream: true,
      stream_options: { include_usage: true },
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
              try {
                yield {
                  type: 'tool_use',
                  toolCall: {
                    ...currentToolCall,
                    arguments: JSON.parse(currentToolArgs),
                  },
                  isComplete: true,
                };
              } catch (parseError) {
                logger.warn(`Failed to parse streaming tool call arguments for ${currentToolCall.name}`, {
                  toolCallId: currentToolCall.id,
                  argumentsLength: currentToolArgs.length,
                  argumentsPreview: currentToolArgs.substring(0, 100),
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                });
                yield {
                  type: 'tool_use',
                  toolCall: {
                    ...currentToolCall,
                    arguments: {},
                  },
                  isComplete: true,
                };
              }
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

      // Yield usage data from the final chunk
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: chunk.usage.prompt_tokens || 0,
            outputTokens: chunk.usage.completion_tokens || 0,
          },
        };
      }
    }

    // Yield any remaining tool call at stream end
    if (currentToolCall.id) {
      try {
        yield {
          type: 'tool_use',
          toolCall: {
            ...currentToolCall,
            arguments: JSON.parse(currentToolArgs),
          },
          isComplete: true,
        };
      } catch (parseError) {
        logger.warn(`Failed to parse final streaming tool call arguments for ${currentToolCall.name}`, {
          toolCallId: currentToolCall.id,
          argumentsLength: currentToolArgs.length,
          argumentsPreview: currentToolArgs.substring(0, 100),
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        yield {
          type: 'tool_use',
          toolCall: {
            ...currentToolCall,
            arguments: {},
          },
          isComplete: true,
        };
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
