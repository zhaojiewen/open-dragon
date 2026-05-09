/**
 * Chat loop handler for REPL
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { AIProvider, Message, ToolCall } from '../providers/base.js';
import type { ToolRegistry } from '../tools/index.js';
import { DragonError, wrapError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';
import { HistoryCompactor } from '../utils/history-compactor.js';
import { perfMonitor } from '../performance/index.js';
import { TOKEN_SAVE_CONFIGS, TOKEN_SAVE_THRESHOLD, SessionState, TokenSaveLevel, isDangerousTool } from './config.js';
import { promptToolConfirm, promptOutsideWorkspace } from './prompts.js';
import type { InputQueueManager } from './input-queue.js';

const logger = getLogger();

// Module-level system prompt
let resolvedSystemPrompt = '';

export function setSystemPrompt(prompt: string): void {
  resolvedSystemPrompt = prompt;
}

export function getSystemPrompt(): string {
  return resolvedSystemPrompt;
}

export interface ChatResult {
  messages: Message[];
  wasAborted?: boolean;
}

export async function handleChat(
  messages: Message[],
  tools: any[],
  provider: AIProvider,
  toolRegistry: ToolRegistry,
  model?: string,
  autoApproveTools?: boolean,
  tokenSaveLevel?: TokenSaveLevel,
  session?: SessionState,
  autoApproveOutsideWorkspace?: boolean,
  workspacePaths?: string[],
  abortSignal?: AbortSignal,
  inputQueue?: InputQueueManager,
): Promise<ChatResult> {
  let currentMessages = [...messages];

  // Reset per-turn tool call counter
  toolRegistry.resetTurnCounter();

  const turnStartTime = performance.now();

  // Apply token-saving configuration
  const saveConfig = TOKEN_SAVE_CONFIGS[tokenSaveLevel || 'off'];
  const effectiveModel = saveConfig.modelSuffix || model;
  const effectiveTools = saveConfig.limitTools
    ? tools.filter((t: any) => ['read', 'write', 'edit', 'bash', 'glob', 'grep'].includes(t.name))
    : tools;

  const streamOptions: any = {
    model: effectiveModel,
    cacheControl: saveConfig.cacheControl,
    maxTokens: saveConfig.maxTokens,
    systemPrompt: resolvedSystemPrompt || undefined,
  };
  if (saveConfig.thinking) {
    streamOptions.thinking = saveConfig.thinking;
  }
  if (saveConfig.effort) {
    streamOptions.effort = saveConfig.effort;
  }

  // Apply token-saving tool output truncation
  if (saveConfig.maxToolOutputSize) {
    toolRegistry.setExecutionLimits({ maxOutputSize: saveConfig.maxToolOutputSize });
  }

  // History compaction
  if (saveConfig.enableCompaction !== false) {
    const compactor = new HistoryCompactor();
    if (compactor.needsCompaction(currentMessages)) {
      process.stdout.write(chalk.dim('\n  Compacting conversation history...\n'));
      const result = await compactor.compact(currentMessages, provider, model);
      if (result.wasCompacted) {
        currentMessages = result.messages;
        process.stdout.write(chalk.dim(`  Reduced from ${result.originalCount} to ${result.compactedCount} messages\n`));
      }
    }
  }

  // Signal streaming start
  if (inputQueue) {
    inputQueue.startStreaming();
  }

  while (true) {
    let fullContent = '';
    const toolCalls: ToolCall[] = [];
    let lastUsage: { inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number } | null = null;
    let isThinking = false;
    let spinner: Ora | null = null;

    try {
      const streamStartTime = performance.now();
      spinner = ora({ text: chalk.dim('Thinking...'), spinner: 'dots' }).start();

      for await (const chunk of provider.stream(currentMessages, effectiveTools, streamOptions)) {
        // Check for abort signal - exit cleanly if user cancelled
        if (abortSignal?.aborted) {
          if (spinner) { spinner.stop(); spinner = null; }
          console.log(chalk.yellow('\n  Stream cancelled by user.'));
          // Signal streaming end
          if (inputQueue) {
            inputQueue.endStreaming();
          }
          return { messages: currentMessages, wasAborted: true };
        }

        if (chunk.type === 'thinking' && chunk.thinking) {
          if (spinner) { spinner.stop(); spinner = null; }
          if (!isThinking) {
            process.stdout.write(chalk.dim('\n  ... thinking ...\n'));
            isThinking = true;
          }
          process.stdout.write(chalk.dim(chunk.thinking));
        } else if (chunk.type === 'text' && chunk.text) {
          if (spinner) {
            spinner.stop();
            spinner = null;
            process.stdout.write('\n');
          }
          if (isThinking) {
            process.stdout.write('\n');
            isThinking = false;
          }
          process.stdout.write(chunk.text);
          fullContent += chunk.text;
        } else if (chunk.type === 'tool_use' && chunk.toolCall && chunk.isComplete) {
          if (spinner) { spinner.stop(); spinner = null; }
          toolCalls.push(chunk.toolCall as ToolCall);
        } else if (chunk.type === 'usage' && chunk.usage) {
          lastUsage = chunk.usage;
        }
      }

      if (spinner) spinner.stop();
      logger.debug(`Stream completed in ${(performance.now() - streamStartTime).toFixed(2)}ms`);

    } catch (error: any) {
      if (spinner) spinner.stop();
      // Signal streaming end on error
      if (inputQueue) {
        inputQueue.endStreaming();
      }
      const wrapped = wrapError(error, 'Stream error');
      logger.error('Stream error', wrapped);
      console.error(chalk.red(`\n  Stream error: ${error.message || error}`));

      if (error.message?.includes('rate') || error.status === 429) {
        console.log(chalk.yellow('  Rate limit hit. Try again in a moment, or switch model with /model.'));
      } else if (error.message?.includes('overloaded') || error.status === 529) {
        console.log(chalk.yellow('  API overloaded. Try again in a few seconds.'));
      }
      throw error;
    }

    // Track cost
    if (lastUsage?.inputTokens && lastUsage?.outputTokens) {
      costTracker.record(
        model || provider.getDefaultModel(),
        lastUsage.inputTokens,
        lastUsage.outputTokens,
        lastUsage.cacheCreationTokens,
        lastUsage.cacheReadTokens
      );
    }

    // Show status line
    const elapsed = ((performance.now() - turnStartTime) / 1000).toFixed(1);
    const sessionTotalTokens = costTracker.getTotalTokens();
    let statusParts: string[] = [`${elapsed}s`];
    if (lastUsage) {
      statusParts.push(`${lastUsage.inputTokens}+${lastUsage.outputTokens} tokens`);
      if (lastUsage.cacheReadTokens && lastUsage.cacheReadTokens > 0) {
        statusParts.push(chalk.dim(`${(lastUsage.cacheReadTokens / 1000).toFixed(0)}K cached`));
      }
    }
    statusParts.push(`${(sessionTotalTokens / 1000).toFixed(0)}K session`);
    if (tokenSaveLevel && tokenSaveLevel !== 'off') {
      const levelColors: Record<string, (s: string) => string> = {
        mild: chalk.blue, moderate: chalk.yellow, aggressive: chalk.red,
      };
      const color = levelColors[tokenSaveLevel] || chalk.dim;
      statusParts.push(color(tokenSaveLevel));
    }
    console.log(chalk.dim(`\n  [${statusParts.join(' · ')}]`));

    currentMessages.push({
      role: 'assistant',
      content: fullContent || '',
    });

    if (toolCalls.length > 0) {
      // Build assistant message with tool_use blocks
      const assistantContent: any[] = [];
      if (fullContent) {
        assistantContent.push({ type: 'text', text: fullContent });
      }
      for (const tc of toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      currentMessages[currentMessages.length - 1] = {
        role: 'assistant',
        content: assistantContent,
      };

      // Process tool calls with workspace checks
      const wsPaths = workspacePaths || [];
      const inWorkspace = toolCalls.filter(tc => wsPaths.length === 0 || isToolInWorkspace(tc, wsPaths));
      const outsideWorkspace = toolCalls.filter(tc => wsPaths.length > 0 && !isToolInWorkspace(tc, wsPaths));

      let deniedTools = new Set<string>();

      // Handle in-workspace tools
      if (inWorkspace.length > 0 && wsPaths.length > 0) {
        console.log(chalk.dim(`  [workspace] Auto-running ${inWorkspace.length} tool(s) within workspace...`));
      }

      // Handle out-of-workspace tools
      if (outsideWorkspace.length > 0) {
        if (autoApproveTools || autoApproveOutsideWorkspace) {
          console.log(chalk.yellow(`  [auto] Executing ${outsideWorkspace.length} tool(s) outside workspace...`));
        } else {
          console.log(chalk.yellow(`\n  ⚠ Tool${outsideWorkspace.length > 1 ? 's' : ''} outside workspace:`));
          for (const tc of outsideWorkspace) {
            const paths = extractPathsFromToolCall(tc).join(', ') || '(unknown paths)';
            const argsSummary = paths.substring(0, 60);
            console.log(chalk.yellow(`    ${tc.name}`) + chalk.dim(`  → ${argsSummary}`));
          }
          if (wsPaths.length > 0) {
            console.log(chalk.dim(`  Workspace: ${wsPaths.join(', ')}`));
          }

          const choice = await promptOutsideWorkspace(outsideWorkspace.length, inWorkspace.length);
          if (choice === 'deny-all') {
            console.log(chalk.red(`  ✗ Denied ${outsideWorkspace.length} out-of-workspace tool(s)`));
            outsideWorkspace.forEach(tc => deniedTools.add(tc.id));
          } else if (choice === 'approve-all-session') {
            autoApproveOutsideWorkspace = true;
            console.log(chalk.green(`  ✓ Out-of-workspace access auto-approved for session.`));
          }
        }
      }

      // Handle in-workspace tools when no workspace configured
      if (inWorkspace.length > 0 && wsPaths.length === 0) {
        if (!autoApproveTools) {
          console.log(chalk.yellow(`\n  ⚠ Dangerous tool${inWorkspace.length > 1 ? 's' : ''}:`));
          for (const tc of inWorkspace) {
            const argsSummary = JSON.stringify(tc.arguments).substring(0, 60);
            console.log(chalk.yellow(`    ${tc.name}`) + chalk.dim(`  ${argsSummary}`));
          }
          const choice = await promptToolConfirm(inWorkspace.length, toolCalls.filter(tc => !isDangerousTool(tc.name)).length);
          if (choice === 'deny-all') {
            console.log(chalk.red(`  ✗ Denied all ${inWorkspace.length} dangerous tool(s)`));
            inWorkspace.forEach(tc => deniedTools.add(tc.id));
          } else if (choice === 'approve-all-session') {
            autoApproveTools = true;
            console.log(chalk.green(`  ✓ Auto-approve enabled for session. /auto to toggle.`));
          }
        }
      }

      // Execute tools
      const toolResults: any[] = [];
      const allToExecute = [...toolCalls.filter(tc => !isDangerousTool(tc.name)), ...toolCalls.filter(tc => isDangerousTool(tc.name))];

      if (allToExecute.length === 0) {
        for (const tc of toolCalls) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: 'Tool execution was denied by user.',
            is_error: true,
          });
        }
      } else {
        for (const tc of allToExecute) {
          if (deniedTools.has(tc.id)) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: 'Tool execution denied.',
              is_error: true,
            });
            continue;
          }

          const toolSpinner = ora({ text: chalk.blue(`  ${tc.name}`), spinner: 'dots' }).start();
          const toolStart = performance.now();
          const result = await toolRegistry.executeToolCall(tc);
          const toolMs = (performance.now() - toolStart).toFixed(0);

          if (result.success) {
            const preview = result.output
              ? result.output.substring(0, 80).replace(/\n/g, ' ')
              : '(no output)';
            toolSpinner.succeed(chalk.green(`${tc.name} (${toolMs}ms): ${preview}${result.output?.length > 80 ? '...' : ''}`));
          } else {
            const errMsg = result.error || 'unknown error';
            toolSpinner.fail(chalk.red(`${tc.name}: ${errMsg}`));
            if (errMsg.toLowerCase().includes('workspace') || errMsg.toLowerCase().includes('scope') || errMsg.toLowerCase().includes('blocked')) {
              console.log(chalk.yellow(`\n  ⚠ Tool tried to access a path outside your workspace.`));
              console.log(chalk.cyan('  /workspace add <path>') + chalk.dim(' to allow this directory'));
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: result.output,
            is_error: !result.success,
          });
        }
      }

      currentMessages.push({
        role: 'user',
        content: toolResults,
      });
      console.log();
      continue;
    }

    // Signal streaming end before return
    if (inputQueue) {
      inputQueue.endStreaming();
    }
    return { messages: currentMessages };
  }
}

/**
 * Extract potential file paths from tool call arguments
 */
export function extractPathsFromToolCall(tc: ToolCall): string[] {
  const paths: string[] = [];
  const args = tc.arguments || {};

  switch (tc.name) {
    case 'write':
    case 'edit':
    case 'read': {
      const fp = args.file_path || args.filePath;
      if (typeof fp === 'string') paths.push(fp);
      break;
    }
    case 'bash': {
      const cmd = args.command;
      if (typeof cmd !== 'string') break;
      const parts = cmd.split(/\s+/);
      for (const part of parts) {
        if (part.startsWith('-') || ['&&', '||', '|', ';', '>', '>>', '<', '&'].includes(part)) continue;
        if (part.startsWith('/') || part.startsWith('~') || part.startsWith('./') || part.startsWith('../')) {
          paths.push(part);
        }
        const quoted = part.match(/^["']([^"']+)["']$/);
        if (quoted && (quoted[1].startsWith('/') || quoted[1].startsWith('~'))) {
          paths.push(quoted[1]);
        }
      }
      break;
    }
  }
  return paths;
}

/**
 * Check if tool paths are within workspace
 */
export function isToolInWorkspace(tc: ToolCall, workspacePaths: string[]): boolean {
  if (workspacePaths.length === 0) return true;
  const filePaths = extractPathsFromToolCall(tc);
  if (filePaths.length === 0) return true;

  for (const fp of filePaths) {
    const expanded = fp.startsWith('~')
      ? path.join(process.env.HOME || os.homedir(), fp.slice(1))
      : fp;
    const resolved = path.resolve(expanded);

    const isAllowed = workspacePaths.some(root => {
      const realRoot = (() => { try { return fs.realpathSync(root); } catch { return root; } })();
      return resolved.startsWith(realRoot + path.sep) || resolved === realRoot;
    });

    if (!isAllowed) return false;
  }
  return true;
}