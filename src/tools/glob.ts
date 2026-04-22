import { glob as globFn } from 'glob';
import path from 'path';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const GlobParamsSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., **/*.ts)'),
  path: z.string().optional().describe('Base directory to search from'),
});

export class GlobTool extends BaseTool {
  readonly name = 'glob';
  readonly description = 'Find files matching glob patterns. Use for discovering files in the codebase.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match files (e.g., **/*.ts)' },
      path: { type: 'string', description: 'Base directory to search from' },
    },
    required: ['pattern'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, GlobParamsSchema);

    const { pattern, path: searchPath } = params as z.infer<typeof GlobParamsSchema>;

    try {
      const cwd = searchPath || context?.workingDirectory || process.cwd();

      const files = await globFn(pattern, {
        cwd,
        nodir: true,
        absolute: true,
      });

      if (files.length === 0) {
        return {
          success: true,
          output: 'No files found matching the pattern.',
        };
      }

      const relativeFiles = files.map(f => path.relative(cwd, f));

      return {
        success: true,
        output: `Found ${files.length} file(s):\n${relativeFiles.join('\n')}`,
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error searching files: ${error.message}`,
        error: error.message,
      };
    }
  }
}
