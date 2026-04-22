import fs from 'fs';
import path from 'path';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const EditParamsSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to edit'),
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z.boolean().optional().describe('Replace all occurrences'),
});

export class EditTool extends BaseTool {
  readonly name = 'edit';
  readonly description = 'Perform exact string replacements in files. Use for making targeted edits.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file to edit' },
      old_string: { type: 'string', description: 'The text to replace' },
      new_string: { type: 'string', description: 'The text to replace it with' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, EditParamsSchema);

    const { file_path, old_string, new_string, replace_all = false } = params as z.infer<typeof EditParamsSchema>;

    try {
      let targetPath = file_path;

      // Handle relative paths
      if (!path.isAbsolute(file_path) && context?.workingDirectory) {
        targetPath = path.join(context.workingDirectory, file_path);
      }

      // Check if file exists
      if (!fs.existsSync(targetPath)) {
        return {
          success: false,
          output: `File not found: ${targetPath}`,
          error: 'File not found',
        };
      }

      // Read the file
      let content = fs.readFileSync(targetPath, 'utf-8');

      // Check if old_string exists
      if (!content.includes(old_string)) {
        return {
          success: false,
          output: `String not found in file: "${old_string}"`,
          error: 'String not found',
        };
      }

      // Count occurrences
      const occurrences = this.countOccurrences(content, old_string);
      if (occurrences > 1 && !replace_all) {
        return {
          success: false,
          output: `Found ${occurrences} occurrences. Use replace_all=true to replace all.`,
          error: 'Multiple occurrences found',
        };
      }

      // Perform replacement
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        content = content.replace(old_string, new_string);
      }

      // Write back
      fs.writeFileSync(targetPath, content, 'utf-8');

      return {
        success: true,
        output: `Successfully replaced ${replace_all ? occurrences : 1} occurrence(s) in ${targetPath}`,
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error editing file: ${error.message}`,
        error: error.message,
      };
    }
  }

  private countOccurrences(str: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = str.indexOf(search, pos)) !== -1) {
      count++;
      pos += search.length;
    }
    return count;
  }
}
