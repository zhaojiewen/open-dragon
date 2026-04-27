import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './base.js';
import type {
  Message,
  ToolDefinition,
  ChatOptions,
  AIResponse,
  StreamChunk,
  ToolCall,
} from './base.js';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini';
  protected apiKey: string;
  protected baseUrl?: string;
  protected models: string[];
  protected defaultModel: string;
  private genAI: GoogleGenerativeAI;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    models?: string[];
    defaultModel?: string;
  }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.models = config.models || ['gemini-1.5-pro', 'gemini-1.5-flash'];
    this.defaultModel = config.defaultModel || 'gemini-1.5-pro';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): Promise<AIResponse> {
    const model = this.genAI.getGenerativeModel({
      model: options?.model || this.defaultModel,
    });

    const { history, systemInstruction } = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: any = {
      contents: history,
    };

    if (systemInstruction) {
      requestParams.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = [{
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      }];
    }

    const result = await model.generateContent(requestParams);
    const response = result.response;

    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.text) {
        textContent += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name,
          name: part.functionCall.name,
          arguments: part.functionCall.args as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: 'end_turn',
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  async *stream(
    messages: Message[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const model = this.genAI.getGenerativeModel({
      model: options?.model || this.defaultModel,
    });

    const { history, systemInstruction } = this.formatMessages(messages, options?.systemPrompt);

    const requestParams: any = {
      contents: history,
    };

    if (systemInstruction) {
      requestParams.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0) {
      requestParams.tools = [{
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      }];
    }

    const result = await model.generateContentStream(requestParams);

    for await (const chunk of result.stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts || []) {
        if (part.text) {
          yield { type: 'text', text: part.text };
        } else if (part.functionCall) {
          yield {
            type: 'tool_use',
            toolCall: {
              id: part.functionCall.name,
              name: part.functionCall.name,
              arguments: part.functionCall.args as Record<string, unknown>,
            },
            isComplete: true,
          };
        }
      }
    }
  }

  private formatMessages(
    messages: Message[],
    systemPrompt?: string
  ): { history: any[]; systemInstruction: string } {
    const history: any[] = [];
    let system = systemPrompt || '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : system;
      } else if (msg.role === 'user') {
        history.push({
          role: 'user',
          parts: [{ text: typeof msg.content === 'string' ? msg.content : '' }],
        });
      } else if (msg.role === 'assistant') {
        history.push({
          role: 'model',
          parts: [{ text: typeof msg.content === 'string' ? msg.content : '' }],
        });
      }
    }

    return { history, systemInstruction: system };
  }
}
