import { z } from 'zod';
import path from 'path';
import fs from 'fs';
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
  /** Paths within which read operations are allowed. If unset, falls back to default (cwd + home + tmp). */
  readScope?: string[];
  /** Paths within which write operations (write/edit/bash) are allowed. If unset, falls back to allowedPaths or default. */
  writeScope?: string[];
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
  protected resolvePath(
    filePath: string,
    context?: ToolContext,
    scope: 'read' | 'write' = 'read',
  ): string {
    let targetPath = filePath;

    if (!path.isAbsolute(filePath) && context?.workingDirectory) {
      targetPath = path.resolve(context.workingDirectory, filePath);
    }

    const resolved = path.resolve(targetPath);

    // Resolve symlinks to the real path to prevent symlink-based traversal
    let realPath: string;
    try {
      realPath = fs.realpathSync(resolved);
    } catch {
      // File doesn't exist yet (e.g., write tool) — walk up to find an existing ancestor
      realPath = this.resolveRealPathForMissingFile(resolved);
    }

    // Block critical system paths (always enforced, even with allowedPaths)
    for (const blocked of BaseTool.BLOCKED_PATHS) {
      if (realPath === blocked || realPath.startsWith(blocked + path.sep) || realPath.startsWith(blocked)) {
        throw new Error(
          `Access to system path "${realPath}" is blocked for security.`
        );
      }
    }

    // Determine allowed roots based on scope
    let allowedRoots: string[];

    // Use scope-specific paths first
    const scopePaths = scope === 'write'
      ? (context?.writeScope || context?.allowedPaths)
      : (context?.readScope || context?.allowedPaths);

    if (scopePaths && scopePaths.length > 0) {
      allowedRoots = scopePaths.map(p => this.resolveRealDir(p));
    } else if (context?.allowedPaths && context.allowedPaths.length > 0) {
      allowedRoots = context.allowedPaths.map(p => this.resolveRealDir(p));
    } else {
      // No explicit restrictions: allow if within working dir, home dir, or temp dir
      const workingDir = this.resolveRealDir(context?.workingDirectory || process.cwd());
      const homeDir = this.resolveRealDir(process.env.HOME || os.homedir());
      const tempDir = this.resolveRealDir(os.tmpdir());
      allowedRoots = [workingDir, homeDir, tempDir];
    }

    // Use realPath for the final check to catch symlink bypasses
    const isAllowed = allowedRoots.some(root =>
      realPath.startsWith(root + path.sep) || realPath === root
    );

    if (!isAllowed) {
      const scopeLabel = scope === 'write' ? 'write' : 'read';
      throw new Error(
        `${scopeLabel} access blocked: "${filePath}" resolves outside ${scopeLabel} scope. ` +
        `Allowed: ${allowedRoots.join(', ')}`
      );
    }

    return resolved;
  }

  /**
   * Walk up the directory tree to find the nearest existing ancestor,
   * resolve it to the real path, then reconstruct the full path.
   * Used when the target file doesn't exist yet (e.g., write tool).
   */
  private resolveRealPathForMissingFile(resolved: string): string {
    let current = path.dirname(resolved);
    const segments: string[] = [path.basename(resolved)];

    while (current && current !== path.dirname(current)) {
      try {
        const realAncestor = fs.realpathSync(current);
        return path.join(realAncestor, ...segments.reverse());
      } catch {
        segments.push(path.basename(current));
        current = path.dirname(current);
      }
    }

    // All ancestors are missing — fall back to resolved path
    return resolved;
  }

  /**
   * Resolve a directory to its real path (following symlinks).
   * Falls back to path.resolve if the directory doesn't exist.
   */
  protected resolveRealDir(dir: string): string {
    const resolved = path.resolve(dir);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
}
