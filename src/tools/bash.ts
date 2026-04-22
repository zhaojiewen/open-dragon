import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';
import { ToolParameterSchema } from '../providers/base.js';

const execAsync = promisify(exec);

const BashParamsSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  description: z.string().optional().describe('Clear, concise description of what this command does'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds'),
});

export class BashTool extends BaseTool {
  readonly name = 'bash';
  readonly description = 'Execute shell commands. Use for git, npm, file operations, and other CLI tasks.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      description: { type: 'string', description: 'Clear, concise description of what this command does' },
      timeout: { type: 'number', description: 'Optional timeout in milliseconds' },
    },
    required: ['command'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, BashParamsSchema);

    const { command, timeout = 120000 } = params as z.infer<typeof BashParamsSchema>;

    try {
      const options: any = {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout,
      };

      if (context?.workingDirectory) {
        options.cwd = context.workingDirectory;
      }

      const { stdout, stderr } = await execAsync(command, options);

      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += `\n[stderr]\n${stderr}`;

      return {
        success: true,
        output: output.trim() || 'Command executed successfully (no output)',
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.message || 'Command failed',
        error: error.message,
      };
    }
  }
}
