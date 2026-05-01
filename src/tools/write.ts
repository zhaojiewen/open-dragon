import fs from 'fs';
import path from 'path';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const WriteParamsSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to write'),
  content: z.string().describe('The content to write to the file'),
});

export class WriteTool extends BaseTool {
  readonly name = 'write';
  readonly description = 'Write content to a file. Creates the file if it does not exist, overwrites if it does.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file to write' },
      content: { type: 'string', description: 'The content to write to the file' },
    },
    required: ['file_path', 'content'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, WriteParamsSchema);

    const { file_path, content } = params as z.infer<typeof WriteParamsSchema>;

    try {
      let targetPath: string;
      try {
        targetPath = this.resolvePath(file_path, context, 'write');
      } catch (pathError: any) {
        return {
          success: false,
          output: pathError.message,
          error: pathError.message,
        };
      }

      // Ensure directory exists
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(targetPath, content, 'utf-8');

      return {
        success: true,
        output: `Successfully wrote ${content.length} characters to ${targetPath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error writing file: ${error.message}`,
        error: error.message,
      };
    }
  }
}
