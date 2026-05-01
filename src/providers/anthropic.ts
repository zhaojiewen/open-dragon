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
import { ApiKeyMissingError, ApiRequestError, ApiRateLimitError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { perfMonitor } from '../performance/index.js';

const logger = getLogger();

const MAX_CACHE_BREAKPOINTS = 4;

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
    this.models = config.models || ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
    this.defaultModel = config.defaultModel || 'claude-opus-4-7';
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
    const { systemPrompt, formattedMessages } = this.formatMessages(
      messages, options?.systemPrompt, options?.cacheControl, tools
    );

    const requestParams: Record<string, any> = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 16000,
    };

    this.applySystemPrompt(requestParams, systemPrompt);
    this.applyThinking(requestParams, options?.thinking);
    this.applyEffort(requestParams, options?.effort);

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }

    try {
      logger.debug(`Sending chat request to Anthropic API (model: ${requestParams.model})`);

      const response = await perfMonitor.measure('anthropic:chat', () =>
        this.client.messages.create(requestParams as Anthropic.Messages.MessageCreateParams)
      ) as Anthropic.Messages.Message;

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
        stopReason: this.mapStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        },
      };
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  async *stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, formattedMessages } = this.formatMessages(
      messages, options?.systemPrompt, options?.cacheControl, tools
    );

    const requestParams: Record<string, any> = {
      model: options?.model || this.defaultModel,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 64000,
      stream: true,
    };

    this.applySystemPrompt(requestParams, systemPrompt);
    this.applyThinking(requestParams, options?.thinking);
    this.applyEffort(requestParams, options?.effort);

    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }

    try {
      logger.debug(`Starting stream to Anthropic API (model: ${requestParams.model})`);

      const stream = this.client.messages.stream(requestParams as Anthropic.Messages.MessageCreateParams);

      const pendingToolCalls: Map<number, { id: string; name: string; jsonBuffer: string }> = new Map();

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            pendingToolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              jsonBuffer: '',
            });
          } else if (event.content_block.type === 'thinking') {
            yield { type: 'thinking', thinking: event.content_block.thinking };
          } else if (event.content_block.type === 'redacted_thinking') {
            yield {
              type: 'thinking',
              thinking: '[Redacted thinking]',
              thinkingSignature: event.content_block.data,
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'thinking_delta') {
            yield { type: 'thinking', thinking: event.delta.thinking };
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
            } catch {
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

      try {
        const finalMessage = await stream.finalMessage();
        if (finalMessage.usage) {
          yield {
            type: 'usage',
            usage: {
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
              cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? undefined,
              cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? undefined,
            },
          };
        }
      } catch {
        logger.debug('Could not extract final usage data from stream');
      }

      logger.debug('Stream completed successfully');
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  private applySystemPrompt(
    params: Record<string, any>,
    systemPrompt: string | any[]
  ): void {
    if (!systemPrompt || (Array.isArray(systemPrompt) && systemPrompt.length === 0)) return;
    params.system = systemPrompt;
  }

  private applyThinking(
    params: Record<string, any>,
    thinking?: boolean | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  ): void {
    if (!thinking) return;

    if (thinking === true) {
      params.thinking = { type: 'adaptive', display: 'summarized' };
    } else {
      params.thinking = { type: 'adaptive', display: thinking.display || 'summarized' };
    }
  }

  private applyEffort(
    params: Record<string, any>,
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  ): void {
    if (effort) {
      params.output_config = { ...(params.output_config || {}), effort };
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ApiKeyMissingError('anthropic');
    }

    if (error instanceof Anthropic.RateLimitError) {
      const retryAfter = error.headers?.get('retry-after');
      throw new ApiRateLimitError(
        'anthropic',
        retryAfter ? parseInt(retryAfter) : undefined
      );
    }

    if (error instanceof Anthropic.BadRequestError) {
      throw new ApiRequestError(
        `Anthropic API error: ${error.message}`,
        'anthropic',
        { originalError: error }
      );
    }

    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new ApiRequestError(
        `Anthropic permission error: ${error.message}`,
        'anthropic',
        { originalError: error }
      );
    }

    if (error instanceof Anthropic.NotFoundError) {
      throw new ApiRequestError(
        `Anthropic resource not found: ${error.message}`,
        'anthropic',
        { originalError: error }
      );
    }

    if (error instanceof Anthropic.InternalServerError) {
      throw new ApiRequestError(
        `Anthropic server error: ${error.message}`,
        'anthropic',
        { originalError: error }
      );
    }

    if (error instanceof Anthropic.APIConnectionError) {
      throw new ApiRequestError(
        `Anthropic connection error: ${error.message}`,
        'anthropic',
        { originalError: error }
      );
    }

    throw new ApiRequestError(
      `Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'anthropic',
      { originalError: error }
    );
  }

  private mapStopReason(stopReason: string | null): AIResponse['stopReason'] {
    switch (stopReason) {
      case 'end_turn': return 'end_turn';
      case 'tool_use': return 'tool_use';
      case 'max_tokens': return 'max_tokens';
      case 'refusal': return 'refusal';
      case 'model_context_window_exceeded': return 'model_context_window_exceeded';
      case 'pause_turn': return 'pause_turn';
      default: return 'end_turn';
    }
  }

  /**
   * Format messages for the Anthropic API.
   *
   * Cache breakpoint strategy (up to 4 breakpoints):
   * 1. System prompt text block
   * 2. Tool descriptions block (inlined into system array) — tools never change per session
   * 3. 3rd-from-last user message — mid-history anchor point
   * 4. Last user message — the immediate turn boundary
   */
  private formatMessages(
    messages: Message[],
    systemPrompt?: string,
    cacheControl?: boolean,
    toolDefinitions?: ToolDefinition[]
  ): { systemPrompt: string | any[]; formattedMessages: Anthropic.Messages.MessageParam[] } {
    const formatted: Anthropic.Messages.MessageParam[] = [];
    let system = systemPrompt || '';

    // Extract system messages from the array
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : system;
      }
    }

    // Build system prompt with cache_control breakpoints when enabled
    if (cacheControl && system) {
      const systemBlocks: any[] = [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ];

      // Add tool descriptions as a cacheable block
      if (toolDefinitions && toolDefinitions.length > 0) {
        const toolDesc = toolDefinitions.map(t =>
          `- ${t.name}: ${t.description}`
        ).join('\n');
        systemBlocks.push({
          type: 'text',
          text: `Available tools:\n${toolDesc}`,
          cache_control: { type: 'ephemeral' },
        });
      }

      // We've used 1-2 breakpoints on system blocks.
      // Remaining available: 2-3 for messages.
      const systemBreakpointCount = systemBlocks.length;
      const remainingBreakpoints = MAX_CACHE_BREAKPOINTS - systemBreakpointCount;

      let messageBreakpointsPlaced = 0;

      // Find user message indices to place cache breakpoints.
      // We want: the last user message (always) + 3rd-from-last (if available).
      const userMessageIndices: number[] = [];
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'user') {
          userMessageIndices.push(i);
        }
      }

      // Track which original message indices get cache breaks
      const cacheBreakIndices = new Set<number>();

      // Always cache the last user message
      if (userMessageIndices.length > 0) {
        cacheBreakIndices.add(userMessageIndices[userMessageIndices.length - 1]);
      }

      // Cache 3rd-from-last user message if we have room and enough messages
      if (remainingBreakpoints >= 2 && userMessageIndices.length >= 3) {
        cacheBreakIndices.add(userMessageIndices[userMessageIndices.length - 3]);
      }

      // Process messages, adding cache_control to designated user messages
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const shouldCacheUserMsg = msg.role === 'user' && cacheBreakIndices.has(i);

        if (msg.role === 'user') {
          if (typeof msg.content === 'string') {
            if (shouldCacheUserMsg) {
              formatted.push({
                role: 'user',
                content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }],
              });
            } else {
              formatted.push({ role: 'user', content: msg.content });
            }
          } else {
            formatted.push({
              role: 'user',
              content: this.formatContentBlocks(msg.content, shouldCacheUserMsg),
            });
          }
        } else if (msg.role === 'assistant') {
          formatted.push({
            role: 'assistant',
            content: typeof msg.content === 'string'
              ? msg.content
              : this.formatContentBlocks(msg.content),
          });
        } else if (msg.role === 'tool') {
          formatted.push({
            role: 'user',
            content: typeof msg.content === 'string'
              ? [{ type: 'tool_result', tool_use_id: msg.toolCallId || '', content: msg.content }]
              : this.formatContentBlocks(msg.content),
          });
        }
      }

      return { systemPrompt: systemBlocks, formattedMessages: formatted };
    }

    // Non-cache path (original behavior)
    for (const msg of messages) {
      if (msg.role === 'system') continue; // Already extracted

      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          formatted.push({ role: 'user', content: msg.content });
        } else {
          formatted.push({ role: 'user', content: this.formatContentBlocks(msg.content) });
        }
      } else if (msg.role === 'assistant') {
        formatted.push({
          role: 'assistant',
          content: typeof msg.content === 'string'
            ? msg.content
            : this.formatContentBlocks(msg.content),
        });
      } else if (msg.role === 'tool') {
        formatted.push({
          role: 'user',
          content: typeof msg.content === 'string'
            ? [{ type: 'tool_result', tool_use_id: msg.toolCallId || '', content: msg.content }]
            : this.formatContentBlocks(msg.content),
        });
      }
    }

    return { systemPrompt: system, formattedMessages: formatted };
  }

  private formatContentBlocks(blocks: any[], cacheLastBlock = false): Anthropic.Messages.ContentBlockParam[] {
    const result: Anthropic.Messages.ContentBlockParam[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const isLast = cacheLastBlock && i === blocks.length - 1;

      if (block.type === 'text') {
        const textBlock: Anthropic.Messages.TextBlockParam = { type: 'text', text: block.text || '' };
        if (isLast) {
          (textBlock as any).cache_control = { type: 'ephemeral' };
        }
        result.push(textBlock);
      } else if (block.type === 'tool_use') {
        result.push({
          type: 'tool_use',
          id: block.id || '',
          name: block.name || '',
          input: block.input || {},
        });
      } else if (block.type === 'tool_result') {
        const toolResultBlock: Anthropic.Messages.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: block.tool_use_id || block.toolUseId || '',
          content: typeof block.content === 'string' ? block.content : (block.content || ''),
          is_error: block.is_error || block.isError || false,
        };
        result.push(toolResultBlock as Anthropic.Messages.ContentBlockParam);
      }
    }
    return result;
  }
}
