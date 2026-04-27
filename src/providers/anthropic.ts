import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';
import type {
  Message,
  ToolDefinition,
  ChatOptions,
  AIResponse,
  StreamChunk,
  ToolCall,
} from './base.js';
import { ProviderError, ApiKeyMissingError, ApiRequestError, ApiRateLimitError, ErrorCode } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { perfMonitor } from '../performance/index.js';

const logger = getLogger();

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  protected apiKey: string;
  protected baseUrl?: string;
  protected models: string[];
  protected defaultModel: string;
  private client: Anthropic;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    models?: string[];
    defaultModel?: string;
  }) {
    super();

    if (!config.apiKey || config.apiKey === 'YOUR_ANTHROPIC_API_KEY') {
      throw new ApiKeyMissingError('anthropic');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.models = config.models || ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'];
    this.defaultModel = config.defaultModel || 'claude-sonnet-4-6';
    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    const { systemPrompt, formattedMessages } = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 4096,
      system: systemPrompt,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool['input_schema'],
      }));
    }

    try {
      logger.debug(`Sending chat request to Anthropic API (model: ${requestParams.model})`);
      
      const response = await perfMonitor.measure('anthropic:chat', () =>
        this.client.messages.create(requestParams)
      );

      const toolCalls: ToolCall[] = [];
      let textContent = '';

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      logger.debug(`Chat completed (tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason: response.stop_reason as 'end_turn' | 'tool_use' | 'max_tokens',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async *stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, formattedMessages } = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 4096,
      system: systemPrompt,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool['input_schema'],
      }));
    }

    try {
      logger.debug(`Starting stream to Anthropic API (model: ${requestParams.model})`);
      
      // Use the messages API correctly with streaming
      const stream = this.client.messages.stream(requestParams);

      // Track tool calls during streaming
      const pendingToolCalls: Map<number, { id: string; name: string; jsonBuffer: string }> = new Map();

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            pendingToolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              jsonBuffer: '',
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            const pending = pendingToolCalls.get(event.index);
            if (pending) {
              pending.jsonBuffer += event.delta.partial_json || '';
            }
          }
        } else if (event.type === 'content_block_stop') {
          const pending = pendingToolCalls.get(event.index);
          if (pending) {
            try {
              const args = JSON.parse(pending.jsonBuffer);
              yield {
                type: 'tool_use',
                toolCall: {
                  id: pending.id,
                  name: pending.name,
                  arguments: args,
                },
                isComplete: true,
              };
            } catch (e) {
              // If JSON parse fails, yield empty args
              yield {
                type: 'tool_use',
                toolCall: {
                  id: pending.id,
                  name: pending.name,
                  arguments: {},
                },
                isComplete: true,
              };
            }
          }
        }
      }
      
      logger.debug('Stream completed successfully');
    } catch (error: any) {
      this.handleError(error);
    }
  }

  /**
   * Handle API errors with appropriate error types
   */
  private handleError(error: any): never {
    if (error.status === 401) {
      throw new ApiKeyMissingError('anthropic');
    }

    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'];
      throw new ApiRateLimitError(
        'anthropic',
        retryAfter ? parseInt(retryAfter) : undefined
      );
    }

    if (error.error?.type === 'authentication_error') {
      throw new ApiKeyMissingError('anthropic');
    }

    throw new ApiRequestError(
      `Anthropic API error: ${error.message || 'Unknown error'}`,
      'anthropic',
      { originalError: error }
    );
  }

  private formatMessages(
    messages: Message[],
    systemPrompt?: string
  ): { systemPrompt: string; formattedMessages: Anthropic.Messages.MessageParam[] } {
    const formatted: Anthropic.Messages.MessageParam[] = [];
    let system = systemPrompt || '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : system;
      } else if (msg.role === 'user') {
        formatted.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : this.formatContentBlocks(msg.content),
        });
      } else if (msg.role === 'assistant') {
        formatted.push({
          role: 'assistant',
          content: typeof msg.content === 'string' ? msg.content : this.formatContentBlocks(msg.content),
        });
      }
    }

    return { systemPrompt: system, formattedMessages: formatted };
  }

  private formatContentBlocks(blocks: any[]): Anthropic.Messages.ContentBlockParam[] {
    const result: Anthropic.Messages.ContentBlockParam[] = [];
    for (const block of blocks) {
      if (block.type === 'text') {
        result.push({ type: 'text', text: block.text || '' });
      } else if (block.type === 'tool_use') {
        result.push({
          type: 'tool_use',
          id: block.id || '',
          name: block.name || '',
          input: block.input || {},
        });
      } else if (block.type === 'tool_result') {
        result.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id || block.toolUseId || '',
          content: block.content || '',
          is_error: block.is_error || block.isError || false,
        } as any);
      }
    }
    return result;
  }
}
