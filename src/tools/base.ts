import { z } from 'zod';
import { ToolParameterSchema, ToolParameters } from '../providers/base.js';

export interface ToolExecuteResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolContext {
  workingDirectory: string;
  permissions?: string[];
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameters;

  abstract execute(
    params: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolExecuteResult>;

  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  protected validateParams(params: Record<string, unknown>, schema: z.ZodType): void {
    const result = schema.safeParse(params);
    if (!result.success) {
      throw new Error(`Invalid parameters: ${result.error.message}`);
    }
  }
}
