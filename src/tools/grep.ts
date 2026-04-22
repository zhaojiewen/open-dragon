import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const execAsync = promisify(exec);

const GrepParamsSchema = z.object({
  pattern: z.string().describe('The pattern to search for'),
  path: z.string().optional().describe('File or directory to search in'),
  file_pattern: z.string().optional().describe('File pattern to limit search (e.g., *.ts)'),
  ignore_case: z.boolean().optional().describe('Case insensitive search'),
});

export class GrepTool extends BaseTool {
  readonly name = 'grep';
  readonly description = 'Search for patterns in files using grep. Use for finding code, text, or patterns.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'The pattern to search for' },
      path: { type: 'string', description: 'File or directory to search in' },
      file_pattern: { type: 'string', description: 'File pattern to limit search (e.g., *.ts)' },
      ignore_case: { type: 'boolean', description: 'Case insensitive search' },
    },
    required: ['pattern'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, GrepParamsSchema);

    const { pattern, path: searchPath, file_pattern, ignore_case = false } = params as z.infer<typeof GrepParamsSchema>;

    try {
      const cwd = searchPath || context?.workingDirectory || process.cwd();

      // Build grep command
      let command = 'grep';
      if (ignore_case) command += ' -i';
      command += ' -rn'; // recursive, line numbers

      if (file_pattern) {
        command += ` --include="${file_pattern}"`;
      }

      command += ` "${pattern.replace(/"/g, '\\"')}" "${cwd}"`;

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10,
        timeout: 30000,
      });

      if (!stdout.trim()) {
        return {
          success: true,
          output: 'No matches found.',
        };
      }

      // Limit output
      const lines = stdout.trim().split('\n');
      const maxLines = 100;
      const truncated = lines.length > maxLines;

      let output = lines.slice(0, maxLines).join('\n');
      if (truncated) {
        output += `\n... (${lines.length - maxLines} more results truncated)`;
      }

      return {
        success: true,
        output,
      };
    } catch (error: any) {
      // grep returns exit code 1 when no matches found
      if (error.code === 1) {
        return {
          success: true,
          output: 'No matches found.',
        };
      }
      return {
        success: false,
        output: `Error searching: ${error.message}`,
        error: error.message,
      };
    }
  }
}
