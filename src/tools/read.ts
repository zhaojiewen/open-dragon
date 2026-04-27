import fs from 'fs';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const ReadParamsSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
});

export class ReadTool extends BaseTool {
  readonly name = 'read';
  readonly description = 'Read a file from the local filesystem. Use for reading code, configs, and other text files.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file to read' },
      offset: { type: 'number', description: 'Line number to start reading from' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, ReadParamsSchema);

    const { file_path, offset = 0, limit } = params as z.infer<typeof ReadParamsSchema>;

    try {
      let targetPath: string;
      try {
        targetPath = this.resolvePath(file_path, context);
      } catch (pathError: any) {
        return {
          success: false,
          output: pathError.message,
          error: 'Path traversal blocked',
        };
      }

      // Check if file exists
      if (!fs.existsSync(targetPath)) {
        return {
          success: false,
          output: `File not found: ${targetPath}`,
          error: 'File not found',
        };
      }

      // Check if it's a directory
      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        return {
          success: false,
          output: `Path is a directory, not a file: ${targetPath}`,
          error: 'Path is a directory',
        };
      }

      // Read the file
      const content = fs.readFileSync(targetPath, 'utf-8');
      const lines = content.split('\n');

      // Apply offset and limit
      const startLine = offset || 0;
      const endLine = limit ? startLine + limit : lines.length;
      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers
      const formattedContent = selectedLines
        .map((line, index) => `${startLine + index + 1}\t${line}`)
        .join('\n');

      return {
        success: true,
        output: formattedContent,
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error reading file: ${error.message}`,
        error: error.message,
      };
    }
  }
}
