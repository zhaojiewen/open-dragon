import { z } from 'zod';
import path from 'path';
import os from 'os';
import { ToolParameterSchema } from '../providers/base.js';
import type { ToolParameters } from '../providers/base.js';

export interface ToolExecuteResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolContext {
  workingDirectory: string;
  permissions?: string[];
  /** Optional list of paths the tool is allowed to access. Defaults to workingDirectory only. */
  allowedPaths?: string[];
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

  // Critical system paths that should never be accessed
  private static readonly BLOCKED_PATHS = [
    '/etc/shadow', '/etc/passwd', '/etc/sudoers', '/etc/ssh',
    '/proc/', '/sys/', '/dev/mem', '/dev/kmem',
  ];

  /**
   * Resolve a file path and validate it stays within allowed directories.
   * Returns absolute path if valid, throws if path traversal is detected.
   *
   * Default allowed roots: working directory, home dir, temp dir, .dragon config.
   * If allowedPaths is explicitly provided, only those paths are allowed.
   */
  protected resolvePath(filePath: string, context?: ToolContext): string {
    let targetPath = filePath;

    if (!path.isAbsolute(filePath) && context?.workingDirectory) {
      targetPath = path.resolve(context.workingDirectory, filePath);
    }

    const resolved = path.resolve(targetPath);

    // Block critical system paths
    for (const blocked of BaseTool.BLOCKED_PATHS) {
      if (resolved === blocked || resolved.startsWith(blocked)) {
        throw new Error(
          `Access to system path "${resolved}" is blocked for security.`
        );
      }
    }

    // If explicit allowedPaths, enforce them strictly
    if (context?.allowedPaths && context.allowedPaths.length > 0) {
      const allowedRoots = context.allowedPaths.map(p => path.resolve(p));
      const isAllowed = allowedRoots.some(root =>
        resolved.startsWith(root + path.sep) || resolved === root
      );
      if (!isAllowed) {
        throw new Error(
          `Path traversal blocked: "${filePath}" resolves outside allowed directories. ` +
          `Allowed: ${allowedRoots.join(', ')}`
        );
      }
      return resolved;
    }

    // No explicit restrictions: allow if within working dir, home dir, or temp dir
    const workingDir = path.resolve(context?.workingDirectory || process.cwd());
    const homeDir = path.resolve(process.env.HOME || os.homedir());
    const tempDir = path.resolve(os.tmpdir());

    const defaultRoots = [workingDir, homeDir, tempDir];

    const isAllowed = defaultRoots.some(root =>
      resolved.startsWith(root + path.sep) || resolved === root
    );

    if (!isAllowed) {
      throw new Error(
        `Path traversal blocked: "${filePath}" resolves to "${resolved}" which is outside allowed directories.`
      );
    }

    return resolved;
  }
}
