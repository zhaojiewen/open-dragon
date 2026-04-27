import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
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

    try {
      const options: any = {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: effectiveTimeout,
      };

      if (context?.workingDirectory) {
        options.cwd = context.workingDirectory;
      }

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
        return `Command blocked: ${reason}. Use dangerouslyDisableSandbox to allow, or rephrase your command.`;
      }
    }

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
