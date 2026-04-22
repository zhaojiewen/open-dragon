import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { AIProvider, Message, ToolCall } from '../providers/base.js';
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

    try {
      const systemPrompt = `You are a specialized agent working on a focused task.
${context?.workingDirectory ? `Working directory: ${context.workingDirectory}` : ''}

Complete the task and provide a clear summary of what you did.

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
          model,
          maxTokens: 4096,
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

        // For now, we don't execute tool calls in sub-agent
        // This can be extended to allow tool use
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
}
