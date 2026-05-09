/**
 * User confirmation prompts for REPL
 */

import readline from 'readline';
import chalk from 'chalk';

/**
 * Prompt at startup whether to use the current directory as workspace.
 */
export function promptWorkspaceInit(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(
      chalk.cyan(`\n  Use current directory as workspace?\n`) +
      chalk.dim(`  ${cwd}\n`) +
      chalk.dim('  ') +
      chalk.green('[y]') + chalk.dim(' yes  ') +
      chalk.red('[n]') + chalk.dim(' no\n') +
      chalk.dim('  Choice: ')
    );

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('close', cleanup);
    };

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase().trim();
      if (['y', 'n'].includes(key)) {
        cleanup();
        process.stdout.write(key + '\n');
        resolve(key === 'y');
      }
    };

    process.stdin.on('data', onData);
    process.stdin.once('close', cleanup);
  });
}

/**
 * Prompt user to confirm dangerous tool execution with single-key shortcuts.
 * Returns: 'approve-once' | 'approve-all-session' | 'deny-all'
 */
export function promptToolConfirm(
  dangerousCount: number,
  safeCount: number
): Promise<'approve-once' | 'approve-all-session' | 'deny-all'> {
  return new Promise((resolve) => {
    const label = safeCount > 0
      ? `${dangerousCount} dangerous tool(s) + ${safeCount} safe tool(s) pending`
      : `${dangerousCount} dangerous tool(s) pending`;

    process.stdout.write(
      chalk.cyan(`\n  ${label}\n`) +
      chalk.dim('  ') +
      chalk.green('[y]') + chalk.dim(' approve  ') +
      chalk.yellow('[a]') + chalk.dim(' approve all (session)  ') +
      chalk.red('[n]') + chalk.dim(' deny\n') +
      chalk.dim('  Choice: ')
    );

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('close', cleanup);
    };

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase().trim();
      if (['y', 'a', 'n'].includes(key)) {
        cleanup();
        process.stdout.write(key + '\n');
        switch (key) {
          case 'y': resolve('approve-once'); break;
          case 'a': resolve('approve-all-session'); break;
          case 'n': resolve('deny-all'); break;
        }
      }
    };

    process.stdin.on('data', onData);
    process.stdin.once('close', cleanup);
  });
}

/**
 * Prompt user when tools try to access paths outside the configured workspace.
 * Default is require-auth (no auto-approve).
 */
export function promptOutsideWorkspace(
  outsideCount: number,
  insideCount: number,
): Promise<'approve-once' | 'approve-all-session' | 'deny-all'> {
  return new Promise((resolve) => {
    const label = insideCount > 0
      ? `${outsideCount} tool(s) outside workspace + ${insideCount} inside`
      : `${outsideCount} tool(s) outside workspace`;

    process.stdout.write(
      chalk.yellow(`\n  ${label}\n`) +
      chalk.dim('  ') +
      chalk.green('[y]') + chalk.dim(' allow once  ') +
      chalk.yellow('[a]') + chalk.dim(' auto-approve out-of-workspace  ') +
      chalk.red('[n]') + chalk.dim(' deny\n') +
      chalk.dim('  Default: require auth for out-of-workspace access\n') +
      chalk.dim('  Choice: ')
    );

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('close', cleanup);
    };

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase().trim();
      if (['y', 'a', 'n'].includes(key)) {
        cleanup();
        process.stdout.write(key + '\n');
        switch (key) {
          case 'y': resolve('approve-once'); break;
          case 'a': resolve('approve-all-session'); break;
          case 'n': resolve('deny-all'); break;
        }
      }
    };

    process.stdin.on('data', onData);
    process.stdin.once('close', cleanup);
  });
}