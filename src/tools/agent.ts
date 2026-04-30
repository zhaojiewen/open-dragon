import { BaseTool } from './base.js';
import type { ToolExecuteResult, ToolContext } from './base.js';
import type { AIProvider, Message, ToolCall } from '../providers/base.js';
import { z } from 'zod';

const AgentParamsSchema = z.object({
  description: z.string().describe('Short description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  model: z.string().optional().describe('Model override'),
});

export class AgentTool extends BaseTool {
  readonly name = 'agent';
  readonly description = 'Launch a sub-agent to handle complex multi-step tasks. Use for parallel work or isolating context.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      description: { type: 'string', description: 'Short description of the task' },
      prompt: { type: 'string', description: 'The task for the agent to perform' },
      model: { type: 'string', description: 'Model override' },
    },
    required: ['description', 'prompt'],
  };

  private provider: AIProvider | null = null;

  setProvider(provider: AIProvider) {
    this.provider = provider;
  }

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, AgentParamsSchema);

    const { description, prompt, model } = params as z.infer<typeof AgentParamsSchema>;

    if (!this.provider) {
      return {
        success: false,
        output: 'Agent provider not configured',
        error: 'No provider',
      };
    }

    // Restrict model override: only allow downgrading to cheaper/faster models
    if (model) {
      const allowedModels = this.getAllowedAgentModels();
      if (!allowedModels.includes(model)) {
        return {
          success: false,
          output: `Model override not allowed. Agent only supports: ${allowedModels.join(', ')}`,
          error: 'Model not allowed for agents',
        };
      }
    }

    try {
      const systemPrompt = `You are a specialized agent working on a focused task.
${context?.workingDirectory ? `Working directory: ${context.workingDirectory}` : ''}

Complete the task and provide a clear summary of what you did.

IMPORTANT: You are running in a sandboxed sub-agent context. Your task is limited in scope and duration. Be focused and concise.

Task: ${description}`;

      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      // Run the sub-agent with limited turns
      const maxTurns = 5;
      let currentMessages = [...messages];

      for (let turn = 0; turn < maxTurns; turn++) {
        const response = await this.provider.chat(currentMessages, undefined, {
          model: model || this.provider.getDefaultModel(),
          maxTokens: 16000,
        });

        if (response.stopReason === 'end_turn' || !response.toolCalls) {
          return {
            success: true,
            output: response.content || 'Agent completed task without output',
          };
        }

        // Add assistant response
        currentMessages.push({
          role: 'assistant',
          content: response.content || '',
        });

        // Note: Sub-agents do not execute tool calls for security
        // This prevents unbounded tool execution chains
      }

      return {
        success: true,
        output: 'Agent completed max turns',
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Agent error: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Only allow non-Opus models for sub-agents to prevent cost exploitation.
   */
  private getAllowedAgentModels(): string[] {
    const providerModels = this.provider ? this.getProviderModels() : [];
    // Filter out most expensive models for sub-agent use
    const excludedPatterns = [/claude-opus/i, /gpt-4[^-]/i];
    return providerModels.filter(m => !excludedPatterns.some(p => p.test(m)));
  }

  private getProviderModels(): string[] {
    // Sub-agents can use any model from the provider that isn't Opus-tier
    return [
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ];
  }
}
