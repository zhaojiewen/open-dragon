import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
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
      timeout: { type: 'number', description: 'Optional timeout in milliseconds (max 600000)' },
    },
    required: ['command'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, BashParamsSchema);

    const { command, timeout = 120000 } = params as z.infer<typeof BashParamsSchema>;

    // Enforce max timeout
    const effectiveTimeout = Math.min(timeout as number, 600000);

    const allowDangerous = context?.permissions?.includes('bash:allow-dangerous');

    if (!allowDangerous) {
      const blockReason = this.checkCommand(command);
      if (blockReason) {
        return {
          success: false,
          output: blockReason,
          error: 'Bash sandbox restriction',
        };
      }
    }

    // Check workspace boundaries for file paths in the command
    const workspaceCheck = this.checkWorkspacePaths(command, context);
    if (workspaceCheck) {
      return {
        success: false,
        output: workspaceCheck,
        error: 'Workspace boundary violation',
      };
    }

    try {
      const options: any = {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: effectiveTimeout,
      };

      if (context?.workingDirectory) {
        options.cwd = context.workingDirectory;
      }

      // Strip sensitive environment variables from child process
      options.env = this.sanitizeEnv(process.env);

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

  /**
   * Strip sensitive environment variables before passing to child process.
   */
  private sanitizeEnv(env: typeof process.env): Record<string, string | undefined> {
    const sensitivePatterns = [
      /api[_-]?key/i, /token/i, /secret/i, /password/i,
      /credential/i, /auth/i, /private[_-]?key/i,
      /DRAGON_PASSWORD/i,
    ];

    const sanitized: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(env)) {
      const isSensitive = sensitivePatterns.some(p => p.test(key));
      sanitized[key] = isSensitive ? undefined : value;
    }
    return sanitized;
  }

  /**
   * Check if a command is safe to run. Returns null if safe, or an error message if blocked.
   * Default sandbox: blocks destructive system commands, but allows common dev operations.
   */
  private checkCommand(command: string): string | null {
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();

    // Block dangerous system commands that can break the OS
    const destructiveCommands = [
      { pattern: /\bsudo\b/i, reason: 'sudo requires elevated privileges' },
      { pattern: /\bdd\s+if=/i, reason: 'dd can overwrite disks' },
      { pattern: /\bmkfs\.\w+/i, reason: 'mkfs formats filesystems' },
      { pattern: /\bshutdown\b/i, reason: 'shutdown can power off the system' },
      { pattern: /\breboot\b/i, reason: 'reboot can restart the system' },
      { pattern: /\binit\s+[0-6]\b/i, reason: 'init can change runlevels' },
      { pattern: /\bkill\s+-[9IL]\b/i, reason: 'force kill can crash processes' },
      { pattern: /\bkillall\b/i, reason: 'killall terminates processes by name' },
      { pattern: /\bpkill\b/i, reason: 'pkill terminates processes by pattern' },
      { pattern: /\bwget\b.*\|\s*(?:ba)?sh\b/i, reason: 'piped download to shell is dangerous' },
      { pattern: /\bcurl\b.*\|\s*(?:ba)?sh\b/i, reason: 'piped download to shell is dangerous' },
      { pattern: /\bchmod\s+[-+]s\b/i, reason: 'setuid/setgid chmod is dangerous' },
    ];

    for (const { pattern, reason } of destructiveCommands) {
      if (pattern.test(trimmed)) {
        return `Command blocked: ${reason}. To bypass: set "dangerouslyDisableSandbox": true in ~/.dragon/config.json → tools.bash. Or rephrase your command.`;
      }
    }

    // Check for command substitution bypasses that could execute blocked commands
    const substitutionCheck = this.checkCommandSubstitution(trimmed);
    if (substitutionCheck) return substitutionCheck;

    // Block recursive delete of important directories
    const safeDeleteCheck = this.checkSafeDelete(trimmed);
    if (safeDeleteCheck) return safeDeleteCheck;

    // Check for destructive pipes and redirects
    const destructiveRedirectCheck = this.checkDestructiveRedirect(trimmed);
    if (destructiveRedirectCheck) return destructiveRedirectCheck;

    return null;
  }

  /**
   * Block rm -rf on the root, home, or working directory itself.
   */
  private checkSafeDelete(command: string): string | null {
    const rmRecursiveMatch = command.match(/\brm\s+-(?:rf|fr|r[^ ]*f|f[^ ]*r)/i);
    if (!rmRecursiveMatch) return null;

    // Extract paths from the command
    const paths = this.extractPaths(command);

    const criticalPaths = ['/', '/home', '/usr', '/bin', '/sbin', '/etc', '/var', '/boot', '/dev', '/sys', '/proc'];
    for (const p of paths) {
      if (criticalPaths.includes(p)) {
        return `Blocked: rm -rf on critical directory "${p}" is too dangerous.`;
      }
      if (p === '~' || p === '$HOME' || p.startsWith('~/')) {
        return `Blocked: rm -rf on home directory. Use a more specific path.`;
      }
    }

    return null;
  }

  /**
   * Block writing to critical system files.
   */
  private checkDestructiveRedirect(command: string): string | null {
    // Block redirect to critical config files
    const redirectMatch = command.match(/(?:>>?|>|\|)\s*(\/[^\s]*)/);
    if (redirectMatch) {
      const target = redirectMatch[1];
      const blockedPaths = ['/etc/', '/boot/', '/dev/', '/sys/', '/proc/', '/bin/', '/sbin/', '/usr/bin/', '/usr/sbin/'];
      for (const blocked of blockedPaths) {
        if (target.startsWith(blocked)) {
          return `Blocked: writing to system path "${target}" is not allowed.`;
        }
      }
    }

    return null;
  }

  /**
   * Detect command substitution bypasses ($(), backticks, eval) that could
   * be used to execute blocked commands.
   */
  private checkCommandSubstitution(command: string): string | null {
    // Detect $(...) subshells that wrap blocked commands
    const subShellMatch = command.match(/\$\((.*?)\)/);
    if (subShellMatch) {
      const inner = subShellMatch[1].trim();
      const lower = inner.toLowerCase();
      if (/\bsudo\b|\bdd\b|\bmkfs\b|\bshutdown\b|\breboot\b|\bkill\b|\bkillall\b/.test(lower)) {
        return `Blocked: command substitution "$(${inner})" attempts to run a blocked command.`;
      }
    }

    // Detect backtick subshells
    const backtickMatch = command.match(/`(.*?)`/);
    if (backtickMatch) {
      const inner = backtickMatch[1].trim();
      const lower = inner.toLowerCase();
      if (/\bsudo\b|\bdd\b|\bmkfs\b|\bshutdown\b|\breboot\b|\bkill\b|\bkillall\b/.test(lower)) {
        return `Blocked: backtick substitution executes a blocked command.`;
      }
    }

    // Detect eval usage that could bypass restrictions
    if (/\beval\s/.test(command)) {
      return `Blocked: eval can be used to bypass command restrictions.`;
    }

    // Detect base64 or hex-encoded command execution
    if (/\b(?:base64|xxd|od)\s.*-d(?:ecode)?\b.*\||\|.*\b(?:base64|xxd|od)\s.*-d(?:ecode)?\b/.test(command)) {
      return `Blocked: decoded command execution can bypass restrictions.`;
    }

    // Detect attempts to source/execute temporary scripts
    if (/\bsource\s+<\(/.test(command) || /\b\.\s+<\(/.test(command)) {
      return `Blocked: process substitution with source can bypass restrictions.`;
    }

    return null;
  }

  /**
   * Validate that file paths in the command are within the allowed workspace.
   * Returns an error message if any path is outside the write scope, or null if safe.
   */
  private checkWorkspacePaths(command: string, context?: ToolContext): string | null {
    // Only enforce if writeScope or allowedPaths are explicitly set
    const scopePaths = context?.writeScope || context?.allowedPaths;
    if (!scopePaths || scopePaths.length === 0) return null;

    const paths = this.extractPaths(command);
    for (const rawPath of paths) {
      try {
        // Expand tilde and resolve
        const expanded = rawPath.startsWith('~')
          ? path.join(process.env.HOME || '/', rawPath.slice(1))
          : rawPath;
        const resolved = path.resolve(context?.workingDirectory || process.cwd(), expanded);

        // Get real path if it exists, otherwise resolve parent
        let realPath = resolved;
        try { realPath = fs.realpathSync(resolved); } catch {
          const parent = path.dirname(resolved);
          try { realPath = path.join(fs.realpathSync(parent), path.basename(resolved)); } catch {}
        }

        // Check if this path is within the allowed scope
        const isAllowed = scopePaths.some(root => {
          const realRoot = this.resolveRealDir(root);
          return realPath.startsWith(realRoot + path.sep) || realPath === realRoot;
        });

        if (!isAllowed) {
          return `Workspace boundary: "${rawPath}" is outside the allowed workspace. ` +
            `Workspace: ${scopePaths.join(', ')}`;
        }
      } catch {
        // If we can't resolve the path, allow it (conservative)
      }
    }

    return null;
  }

  /**
   * Extract potential file paths from a command string.
   */
  private extractPaths(command: string): string[] {
    const parts = command.split(/\s+/);
    const paths: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // Skip flags
      if (part.startsWith('-')) continue;
      // Skip shell operators
      if (['&&', '||', '|', ';', '>', '>>', '<', '&'].includes(part)) continue;

      if (part.startsWith('/') || part.startsWith('~') || part.startsWith('$')) {
        paths.push(part);
      }
    }

    return paths;
  }
}
