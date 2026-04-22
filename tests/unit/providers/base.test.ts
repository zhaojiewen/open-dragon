import { describe, it, expect } from 'vitest';
import {
  ToolParameterSchema,
  BaseProvider,
  type ToolDefinition,
  type Message,
  type AIResponse,
  type StreamChunk,
  type ChatOptions,
} from '../../../src/providers/base.js';

describe('ToolParameterSchema', () => {
  it('should validate valid tool parameters', () => {
    const params = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['name'],
    };

    const result = ToolParameterSchema.parse(params);
    expect(result.type).toBe('object');
    expect(result.required).toEqual(['name']);
  });

  it('should validate without required field', () => {
    const params = {
      type: 'object' as const,
      properties: {},
    };

    const result = ToolParameterSchema.parse(params);
    expect(result.type).toBe('object');
    expect(result.required).toBeUndefined();
  });

  it('should reject non-object type', () => {
    expect(() =>
      ToolParameterSchema.parse({ type: 'string', properties: {} })
    ).toThrow();
  });
});

// Create a concrete implementation for testing
class TestProvider extends BaseProvider {
  readonly name = 'test';
  protected apiKey = 'test-key';
  protected models = ['model-1', 'model-2'];
  protected defaultModel = 'model-1';

  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    return {
      content: 'test response',
      stopReason: 'end_turn',
    };
  }

  async *stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    yield { type: 'text', text: 'test' };
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('should return models list', async () => {
    const models = await provider.listModels();
    expect(models).toEqual(['model-1', 'model-2']);
  });

  it('should return default model', () => {
    const defaultModel = provider.getDefaultModel();
    expect(defaultModel).toBe('model-1');
  });

  it('should build tool definitions', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'bash',
        description: 'Execute bash commands',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          required: ['command'],
        },
      },
    ];

    const result = (provider as any).buildToolDefinitions(tools);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('bash');
    expect(result[0].input_schema).toBeDefined();
  });

  it('should implement chat method', async () => {
    const response = await provider.chat([]);
    expect(response.content).toBe('test response');
    expect(response.stopReason).toBe('end_turn');
  });

  it('should implement stream method', async () => {
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream([])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('test');
  });
});
