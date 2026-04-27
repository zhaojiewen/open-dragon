import { spawn } from 'child_process';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

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

    const cwd = searchPath || context?.workingDirectory || process.cwd();

    // Build args array for safe execution (no shell interpolation)
    const args: string[] = ['-rn']; // recursive, line numbers
    if (ignore_case) args.push('-i');
    if (file_pattern) {
      args.push(`--include=${file_pattern}`);
    }
    args.push('--', pattern, cwd);

    return new Promise((resolve) => {
      const child = spawn('grep', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      child.stdout!.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 1024 * 1024 * 10) { // 10MB limit
          child.kill();
          killed = true;
          resolve({
            success: false,
            output: 'Grep output exceeded 10MB limit. Try a more specific pattern.',
            error: 'Output too large',
          });
        }
      });

      child.stderr!.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (killed) return;

        if (code === 0 && stdout.trim()) {
          const lines = stdout.trim().split('\n');
          const maxLines = 100;
          const truncated = lines.length > maxLines;

          let output = lines.slice(0, maxLines).join('\n');
          if (truncated) {
            output += `\n... (${lines.length - maxLines} more results truncated)`;
          }

          resolve({ success: true, output });
        } else if (code === 1) {
          resolve({ success: true, output: 'No matches found.' });
        } else {
          resolve({
            success: false,
            output: stderr || `grep exited with code ${code}`,
            error: stderr || `Exit code: ${code}`,
          });
        }
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          output: `Error executing grep: ${err.message}`,
          error: err.message,
        });
      });
    });
  }
}
