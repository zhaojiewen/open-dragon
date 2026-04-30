import * as readline from 'readline';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { loadConfig } from './config/index.js';
import type { DragonConfig } from './config/index.js';
import { createProvider } from './providers/index.js';
import type { AIProvider } from './providers/index.js';
import { ToolRegistry, createToolRegistry } from './tools/index.js';
import type { Message, AIResponse, ToolCall } from './providers/base.js';
import { DragonError, ConfigError, wrapError } from './utils/errors.js';
import { getLogger } from './utils/logger.js';
import { costTracker } from './utils/cost-tracker.js';
import { perfMonitor } from './performance/index.js';

const logger = getLogger();

interface ReplOptions {
  provider?: string;
  model?: string;
  enableMonitoring?: boolean;
  enableEncryption?: boolean;
}

export async function startRepl(options: ReplOptions = {}): Promise<void> {
  let config: DragonConfig;
  let provider: AIProvider;
  let toolRegistry: ToolRegistry;
  let messages: Message[] = [];
  const sessionState: SessionState = {
    provider: null as unknown as AIProvider,
    providerName: options.provider || '',
    model: options.model,
    autoApproveTools: false,
    autoApproveOutsideWorkspace: false,
    tokenSaveLevel: 'off',
    tokenSavePrompted: false,
  };

  // Enable performance monitoring if requested
  if (options.enableMonitoring) {
    perfMonitor.setEnabled(true);
    logger.info('Performance monitoring enabled');
  }

  try {
    logger.time('config-load');
    config = await loadConfig(options.enableEncryption);
    logger.timeEnd('config-load');

    const providerName = options.provider || config.defaultProvider;
    
    logger.time('provider-init');
    provider = createProvider(providerName, config);
    logger.timeEnd('provider-init');
    
    sessionState.provider = provider;
    sessionState.providerName = providerName;
    sessionState.model = options.model || provider.getDefaultModel();
    toolRegistry = createToolRegistry(process.cwd());
    toolRegistry.setProvider(provider);
    toolRegistry.setPermissions(
      config.tools?.bash?.dangerouslyDisableSandbox
        ? ['bash:allow-dangerous']
        : []
    );

    // Wire up execution limits from config
    if (config.tools?.executionLimits) {
      toolRegistry.setExecutionLimits({
        maxToolCallsPerTurn: config.tools.executionLimits.maxToolCallsPerTurn,
        maxTotalToolCalls: config.tools.executionLimits.maxTotalToolCalls,
        maxOutputSize: config.tools.executionLimits.maxOutputSize,
      });
    }

    // Wire up workspace scope
    if (config.workspace?.enforceBounds && config.workspace.paths.length > 0) {
      toolRegistry.setWorkspaceScope(
        config.workspace.paths,
        config.workspace.allowHomeDir
          ? [...config.workspace.paths, process.env.HOME || ''].filter(Boolean)
          : config.workspace.paths
      );
      logger.info('Workspace bounds enforced', { paths: config.workspace.paths });
    } else if (config.workspace?.paths.length) {
      toolRegistry.setWorkspaceScope(config.workspace.paths);
    }

    // When workspace bounds are active, default to auto-approve tools within workspace
    if (config.workspace?.enforceBounds && config.workspace.paths.length > 0) {
      sessionState.autoApproveTools = true;
    }

    const toolCount = toolRegistry.getToolDefinitions(config.tools?.enabled).length;
    const sandboxStatus = config.tools?.bash?.dangerouslyDisableSandbox
      ? chalk.yellow('disabled (unsafe)')
      : chalk.green('enabled');
    const cacheStatus = chalk.green('on');
    const permStatus = sessionState.autoApproveTools
      ? chalk.yellow('all auto')
      : sessionState.autoApproveOutsideWorkspace
        ? chalk.yellow('out-ws auto')
        : chalk.green('ws auto / out ask');
    const workspaceStatus = config.workspace?.enforceBounds && config.workspace.paths.length > 0
      ? chalk.yellow(`${config.workspace.paths.length} dir(s) locked`)
      : chalk.dim('open');

    console.log(chalk.dim(`  Provider: ${providerName}  ·  Model: ${sessionState.model}`));
    console.log(chalk.dim(`  Tools: ${toolCount}  ·  Sandbox: ${sandboxStatus}  ·  Cache: ${cacheStatus}  ·  Permissions: ${permStatus}  ·  Workspace: ${workspaceStatus}`));
    console.log(chalk.dim('  /auto · /workspace · /save-tokens · /help'));

    // First-run tip: explain workspace auto-execute behavior
    if (config.workspace?.enforceBounds && config.workspace.paths.length > 0) {
      console.log();
      console.log(chalk.green('  Tip:'));
      console.log(chalk.dim(`  Tools (bash/write/edit) inside workspace auto-execute without confirmation.`));
      console.log(chalk.dim(`  Workspace: ${config.workspace.paths.join(', ')}`));
      console.log(chalk.yellow('  /ask') + chalk.dim(' to require confirmation for all dangerous tools.'));
    }

    console.log();
  } catch (error: any) {
    const wrappedError = wrapError(error, 'Initialization failed');
    logger.error('Failed to initialize', error);

    if (wrappedError instanceof ConfigError) {
      console.log(chalk.yellow('No configuration found. Run `dragon init` to create one.'));
      console.log(chalk.dim('Or with encryption: DRAGON_PASSWORD=yourpass dragon init --encrypt'));
    } else if (error.message?.includes('API key')) {
      console.log(chalk.yellow(`API key missing for ${options.provider || 'default provider'}.`));
      console.log(chalk.dim('Run dragon config edit to add your API key.'));
    } else if (error.message?.includes('Unknown provider')) {
      console.log(chalk.yellow(`Provider not found: ${options.provider || 'default'}`));
      console.log(chalk.dim('Configure it in ~/.dragon/config.json or use a different provider with --provider.'));
    } else {
      console.error(chalk.red(`Init error: ${error.message || error}`));
    }

    process.exit(1);
  }

  // Check if stdin is a TTY (interactive) or piped
  const isInteractive = process.stdin.isTTY;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('> '),
  });

  // For piped input, collect all lines first and process them
  if (!isInteractive) {
    const lines: string[] = [];

    rl.on('line', (line) => {
      lines.push(line);
    });

    rl.on('close', async () => {
      // Process all collected lines
      for (const line of lines) {
        const input = line.trim();
        if (!input) continue;

        if (input.startsWith('/')) {
          const keepRunning = await handleCommand(input, config, messages, toolRegistry, sessionState as SessionState);
          if (!keepRunning) {
            break;
          }
          continue;
        }

        messages.push({ role: 'user', content: input });

        try {
          const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
          const response = await handleChat(messages, tools, sessionState.provider, toolRegistry, sessionState.model, sessionState.autoApproveTools, sessionState.tokenSaveLevel, sessionState, sessionState.autoApproveOutsideWorkspace, config.workspace?.paths || []);
          messages = response.messages;
          console.log();
        } catch (error: any) {
          console.error(chalk.red('Error:'), error.message);
        }
      }
      console.log(chalk.dim('\nGoodbye!'));
      process.exit(0);
    });
  } else {
    // Interactive mode
    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        const keepRunning = await handleCommand(input, config, messages, toolRegistry, sessionState as SessionState);
        if (!keepRunning) {
          rl.close();
          return;
        }
        rl.prompt();
        return;
      }

      messages.push({ role: 'user', content: input });

      try {
        const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
        const response = await handleChat(messages, tools, sessionState.provider, toolRegistry, sessionState.model);
        messages = response.messages;
        console.log();
        rl.prompt();
      } catch (error: any) {
        console.error(chalk.red('Error:'), error.message);
        rl.prompt();
      }
    });

    rl.on('close', () => {
      console.log(chalk.dim('\nGoodbye!'));
      process.exit(0);
    });
  }
}

// Tools that require user confirmation before executing
const DANGEROUS_TOOL_NAMES = new Set(['bash', 'write', 'edit', 'agent']);

function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOL_NAMES.has(name);
}

async function handleChat(
  messages: Message[],
  tools: any[],
  provider: AIProvider,
  toolRegistry: ToolRegistry,
  model?: string,
  autoApproveTools?: boolean,
  tokenSaveLevel?: TokenSaveLevel,
  tokenSavePrompted?: SessionState,
  autoApproveOutsideWorkspace?: boolean,
  workspacePaths?: string[],
): Promise<{ messages: Message[] }> {
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
  };
  if (saveConfig.thinking) {
    streamOptions.thinking = saveConfig.thinking;
  }
  if (saveConfig.effort) {
    streamOptions.effort = saveConfig.effort;
  }

  while (true) {
    let fullContent = '';
    const toolCalls: ToolCall[] = [];
    let lastUsage: { inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number } | null = null;
    let isThinking = false;
    let spinner: Ora | null = null;

    try {
      const streamStartTime = performance.now();

      // Show initial spinner
      spinner = ora({ text: chalk.dim('Thinking...'), spinner: 'dots' }).start();

      for await (const chunk of provider.stream(currentMessages, effectiveTools, streamOptions)) {
        if (chunk.type === 'thinking' && chunk.thinking) {
          // Stop spinner and show thinking text
          if (spinner) { spinner.stop(); spinner = null; }
          if (!isThinking) {
            process.stdout.write(chalk.dim('\n  ... thinking ...\n'));
            isThinking = true;
          }
          process.stdout.write(chalk.dim(chunk.thinking));
        } else if (chunk.type === 'text' && chunk.text) {
          // First text: stop spinner, prep newline
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

      const streamDuration = performance.now() - streamStartTime;
      logger.debug(`Stream completed in ${streamDuration.toFixed(2)}ms`);

    } catch (error: any) {
      if (spinner) spinner.stop();
      const wrapped = wrapError(error, 'Stream error');
      logger.error('Stream error', wrapped);
      console.error(chalk.red(`\n  Stream error: ${error.message || error}`));

      // For rate limits, suggest waiting
      if (error.message?.includes('rate') || error.status === 429) {
        console.log(chalk.yellow('  Rate limit hit. Try again in a moment, or switch model with /model.'));
      } else if (error.message?.includes('overloaded') || error.status === 529) {
        console.log(chalk.yellow('  API overloaded. Try again in a few seconds.'));
      }

      throw error;
    }

    // Track cost if usage data available
    if (lastUsage?.inputTokens && lastUsage?.outputTokens) {
      costTracker.record(
        model || provider.getDefaultModel(),
        lastUsage.inputTokens,
        lastUsage.outputTokens
      );
    }

    // Check if session tokens exceeded threshold - suggest token-saving mode
    const sessionTotalTokens = costTracker.getTotalTokens();
    const shouldPromptTokenSave = sessionTotalTokens > TOKEN_SAVE_THRESHOLD
      && tokenSaveLevel === 'off'
      && tokenSavePrompted && !tokenSavePrompted.tokenSavePrompted;

    // Show status line with token usage and timing
    const elapsed = ((performance.now() - turnStartTime) / 1000).toFixed(1);
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

    // Show token-saving prompt if threshold exceeded
    if (shouldPromptTokenSave) {
      if (tokenSavePrompted) tokenSavePrompted.tokenSavePrompted = true;
      console.log(chalk.yellow(`\n  ⚡ Session tokens: ${(sessionTotalTokens / 1000000).toFixed(1)}M — exceeded 1M threshold.`));
      console.log(chalk.cyan('  /save-tokens') + chalk.dim(' to choose a level: mild · moderate · aggressive'));
      console.log(chalk.dim('  Reduces token usage 20-70% depending on level.'));
    }

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

      // Replace last assistant message with proper format
      currentMessages[currentMessages.length - 1] = {
        role: 'assistant',
        content: assistantContent,
      };

      // Split into dangerous and safe tools
      const safeTools = toolCalls.filter(tc => !isDangerousTool(tc.name));
      const dangerousTools = toolCalls.filter(tc => isDangerousTool(tc.name));

      // Further split dangerous tools by workspace scope
      const wsPaths = workspacePaths || [];
      const inWorkspace = dangerousTools.filter(tc => wsPaths.length === 0 || isToolInWorkspace(tc, wsPaths));
      const outsideWorkspace = dangerousTools.filter(tc => wsPaths.length > 0 && !isToolInWorkspace(tc, wsPaths));

      let deniedTools = new Set<string>();

      // In-workspace dangerous tools: auto-approve when workspace is configured
      if (inWorkspace.length > 0 && wsPaths.length > 0) {
        console.log(chalk.dim(`  [workspace] Auto-running ${inWorkspace.length} tool(s) within workspace...`));
      }

      // Out-of-workspace dangerous tools: require confirmation (default)
      if (outsideWorkspace.length > 0) {
        if (autoApproveTools || autoApproveOutsideWorkspace) {
          console.log(chalk.yellow(`  [auto] Executing ${outsideWorkspace.length} tool(s) outside workspace...`));
        } else {
          // Show what tools are outside workspace
          console.log(chalk.yellow(`\n  ⚠ Tool${outsideWorkspace.length > 1 ? 's' : ''} outside workspace:`));
          for (const tc of outsideWorkspace) {
            const paths = extractPathsFromToolCall(tc).join(', ') || '(unknown paths)';
            const argsSummary = paths.substring(0, 60);
            console.log(chalk.yellow(`    ${tc.name}`) + chalk.dim(`  → ${argsSummary}`));
          }
          if (wsPaths.length > 0) {
            console.log(chalk.dim(`  Workspace: ${wsPaths.join(', ')}`));
          }

          // Get confirmation for out-of-workspace access
          const choice = await promptOutsideWorkspace(outsideWorkspace.length, inWorkspace.length + safeTools.length);
          if (choice === 'deny-all') {
            console.log(chalk.red(`  ✗ Denied ${outsideWorkspace.length} out-of-workspace tool(s)`));
            outsideWorkspace.forEach(tc => deniedTools.add(tc.id));
          } else if (choice === 'approve-all-session') {
            autoApproveOutsideWorkspace = true;
            console.log(chalk.green(`  ✓ Out-of-workspace access auto-approved for session.`));
            console.log(chalk.dim('  /auto to toggle all approval.'));
          }
          // else 'approve-once' — proceed
        }
      }

      // In-workspace tools when no workspace configured: use existing autoApproveTools logic
      if (inWorkspace.length > 0 && wsPaths.length === 0) {
        if (autoApproveTools) {
          console.log(chalk.dim(`  [auto] Executing ${inWorkspace.length} tool(s)...`));
        } else {
          console.log(chalk.yellow(`\n  ⚠ Dangerous tool${inWorkspace.length > 1 ? 's' : ''}:`));
          for (const tc of inWorkspace) {
            const argsSummary = JSON.stringify(tc.arguments).substring(0, 60);
            console.log(chalk.yellow(`    ${tc.name}`) + chalk.dim(`  ${argsSummary}`));
          }
          const choice = await promptToolConfirm(inWorkspace.length, safeTools.length);
          if (choice === 'deny-all') {
            console.log(chalk.red(`  ✗ Denied all ${inWorkspace.length} dangerous tool(s)`));
            inWorkspace.forEach(tc => deniedTools.add(tc.id));
          } else if (choice === 'approve-all-session') {
            autoApproveTools = true;
            console.log(chalk.green(`  ✓ Auto-approve enabled for session. /auto to toggle.`));
          }
        }
      }

      // Build tool results
      const toolResults: any[] = [];
      const allToExecute = [...safeTools, ...dangerousTools];

      if (allToExecute.length === 0) {
        // All tools denied
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

            // Friendly workspace boundary prompt
            if (errMsg.toLowerCase().includes('workspace') || errMsg.toLowerCase().includes('scope')) {
              console.log(chalk.yellow(`\n  ⚠ Tool tried to access a path outside your workspace.`));
              console.log(chalk.cyan('  /workspace add <path>') + chalk.dim(' to allow this directory'));
              console.log(chalk.cyan('  /workspace off') + chalk.dim(' to disable workspace enforcement'));
              console.log();
            } else if (errMsg.includes('limit')) {
              console.log(chalk.yellow('  Tool execution limit reached. Try simplifying your request.'));
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

    return { messages: currentMessages };
  }
}

// Show warning when session exceeds this many tokens
const TOKEN_SAVE_THRESHOLD = 1_000_000;

type TokenSaveLevel = 'off' | 'mild' | 'moderate' | 'aggressive';

interface TokenSaveConfig {
  label: string;
  thinking: any | undefined;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  maxTokens: number;
  cacheControl: boolean;
  modelSuffix?: string;
  limitTools: boolean;
}

const TOKEN_SAVE_CONFIGS: Record<TokenSaveLevel, TokenSaveConfig> = {
  off: {
    label: 'Off',
    thinking: { type: 'adaptive', display: 'summarized' },
    effort: undefined,
    maxTokens: 64000,
    cacheControl: true,
    limitTools: false,
  },
  mild: {
    label: 'Mild — thinking on, effort=medium, 32K max',
    thinking: { type: 'adaptive', display: 'summarized' },
    effort: 'medium',
    maxTokens: 32000,
    cacheControl: true,
    limitTools: false,
  },
  moderate: {
    label: 'Moderate — no thinking, effort=low, 16K max, no cache writes',
    thinking: undefined,
    effort: 'low',
    maxTokens: 16000,
    cacheControl: false,
    limitTools: false,
  },
  aggressive: {
    label: 'Aggressive — Haiku model, no thinking, 8K max, limited tools',
    thinking: undefined,
    effort: 'low',
    maxTokens: 8000,
    cacheControl: false,
    modelSuffix: 'claude-haiku-4-5',
    limitTools: true,
  },
};

interface SessionState {
  provider: AIProvider;
  providerName: string;
  model?: string;
  autoApproveTools: boolean;
  autoApproveOutsideWorkspace: boolean;
  tokenSaveLevel: TokenSaveLevel;
  tokenSavePrompted: boolean;
}

/**
 * Extract potential file paths from tool call arguments for workspace boundary checking.
 */
function extractPathsFromToolCall(tc: ToolCall): string[] {
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
      // Extract paths from common patterns
      const parts = cmd.split(/\s+/);
      for (const part of parts) {
        if (part.startsWith('-') || ['&&', '||', '|', ';', '>', '>>', '<', '&'].includes(part)) continue;
        // Path-like: starts with /, ~, ./, ../
        if (part.startsWith('/') || part.startsWith('~') || part.startsWith('./') || part.startsWith('../')) {
          paths.push(part);
        }
        // Quoted paths
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
 * Check if any paths in the tool call arguments fall outside the workspace scope.
 * Returns true if all paths are within workspace, false if any are outside.
 */
function isToolInWorkspace(tc: ToolCall, workspacePaths: string[]): boolean {
  if (workspacePaths.length === 0) return true; // No workspace configured

  const filePaths = extractPathsFromToolCall(tc);
  if (filePaths.length === 0) return true; // No file paths to check

  for (const fp of filePaths) {
    const expanded = fp.startsWith('~')
      ? path.join(process.env.HOME || '/', fp.slice(1))
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

/**
 * Prompt user to confirm dangerous tool execution with single-key shortcuts.
 * Returns: 'approve-once' | 'approve-all-session' | 'deny-all'
 */
function promptToolConfirm(
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

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase().trim();
      if (['y', 'a', 'n'].includes(key)) {
        process.stdin.setRawMode(wasRaw || false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write(key + '\n');
        switch (key) {
          case 'y': resolve('approve-once'); break;
          case 'a': resolve('approve-all-session'); break;
          case 'n': resolve('deny-all'); break;
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Prompt user when tools try to access paths outside the configured workspace.
 * Default is require-auth (no auto-approve).
 */
function promptOutsideWorkspace(
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

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase().trim();
      if (['y', 'a', 'n'].includes(key)) {
        process.stdin.setRawMode(wasRaw || false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write(key + '\n');
        switch (key) {
          case 'y': resolve('approve-once'); break;
          case 'a': resolve('approve-all-session'); break;
          case 'n': resolve('deny-all'); break;
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

async function handleWorkspaceCommand(
  args: string[],
  config: DragonConfig,
  toolRegistry: ToolRegistry,
): Promise<boolean> {
  const action = args[0]?.toLowerCase();

  switch (action) {
    case 'add': {
      const newPath = args[1];
      if (!newPath) {
        console.log(chalk.red('  Usage: /workspace add <path>'));
        return true;
      }
      const resolved = path.resolve(newPath);
      if (!fs.existsSync(resolved)) {
        console.log(chalk.red(`  Path does not exist: ${resolved}`));
        return true;
      }
      const currentPaths = config.workspace?.paths || [];
      if (currentPaths.includes(resolved)) {
        console.log(chalk.dim(`  Path already in workspace: ${resolved}`));
        return true;
      }
      // Update config
      if (!config.workspace) {
        config.workspace = { paths: [], writeEnabled: true, enforceBounds: true, allowHomeDir: true };
      }
      config.workspace.paths = [...currentPaths, resolved];
      config.workspace.enforceBounds = true;
      toolRegistry.setWorkspaceScope(
        config.workspace.paths,
        config.workspace.allowHomeDir
          ? [...config.workspace.paths, process.env.HOME || ''].filter(Boolean)
          : config.workspace.paths
      );
      // Persist to disk
      try {
        const { saveConfig } = await import('./config/index.js');
        saveConfig(config);
        console.log(chalk.green(`  ✓ Added to workspace: ${resolved}`));
      } catch (e: any) {
        console.log(chalk.red(`  Failed to save config: ${e.message}`));
      }
      return true;
    }
    case 'off':
      if (config.workspace) {
        config.workspace.enforceBounds = false;
        toolRegistry.setWorkspaceScope([]); // Clear scope
        try {
          const { saveConfig } = await import('./config/index.js');
          saveConfig(config);
        } catch {}
      }
      console.log(chalk.yellow('  Workspace enforcement disabled. All paths are now accessible.'));
      console.log(chalk.dim('  /workspace on to re-enable.'));
      return true;
    case 'on':
      if (config.workspace && config.workspace.paths.length > 0) {
        config.workspace.enforceBounds = true;
        toolRegistry.setWorkspaceScope(
          config.workspace.paths,
          config.workspace.allowHomeDir
            ? [...config.workspace.paths, process.env.HOME || ''].filter(Boolean)
            : config.workspace.paths
        );
        try {
          const { saveConfig } = await import('./config/index.js');
          saveConfig(config);
        } catch {}
        console.log(chalk.green('  ✓ Workspace enforcement enabled.'));
        console.log(chalk.dim(`  Paths: ${config.workspace.paths.join(', ')}`));
      } else {
        console.log(chalk.yellow('  No workspace paths configured. Use /workspace add <path> first.'));
      }
      return true;
    default:
      // Show current workspace status
      const paths = config.workspace?.paths || [];
      const enforced = config.workspace?.enforceBounds ?? false;
      console.log(chalk.yellow('\n  Workspace:'));
      console.log(chalk.dim(`  Status: ${enforced ? chalk.green('enforced') : chalk.yellow('disabled')}`));
      if (paths.length > 0) {
        paths.forEach((p: string) => console.log(chalk.dim(`  • ${p}`)));
      } else {
        console.log(chalk.dim('  No paths configured.'));
      }
      console.log(chalk.dim('\n  /workspace add <path>') + '  Add directory to workspace');
      console.log(chalk.dim('  /workspace on|off     ') + '  Enable/disable enforcement');
      console.log();
      return true;
  }
}

async function handleCommand(
  input: string,
  config: DragonConfig,
  messages: Message[],
  toolRegistry: ToolRegistry,
  session: SessionState
): Promise<boolean> {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
      console.log(chalk.yellow('\n  Commands:'));
      console.log(chalk.dim('  ── Session ──'));
      console.log('  /clear       Clear conversation history');
      console.log('  /history     Show conversation history');
      console.log('  /save, /load Save/load conversation');
      console.log(chalk.dim('  ── Provider & Model ──'));
      console.log('  /provider    Show or change provider (e.g. /provider openai)');
      console.log('  /model       Show or change model (e.g. /model claude-sonnet-4-6)');
      console.log('  /tools       List available tools');
      console.log('  /auto        Toggle auto-approve all dangerous tools');
      console.log('  /ask         Require confirmation for all dangerous tools');
      console.log('  /workspace   Manage workspace paths (add/on/off)');
      console.log('  /save-tokens Toggle token-saving eco mode (/eco)');
      console.log(chalk.dim('  ── Diagnostics ──'));
      console.log('  /cost        Show token usage & cost estimate');
      console.log('  /perf        Show performance report (--monitor flag required)');
      console.log('  /debug       Toggle debug mode (on/off)');
      console.log(chalk.dim('  ── Other ──'));
      console.log('  /encrypt     Show encryption info');
      console.log('  /exit, /quit Exit REPL');
      console.log();
      return true;

    case 'clear':
      messages.length = 0;
      costTracker.reset();
      session.tokenSavePrompted = false;
      console.log(chalk.dim('Conversation and token counter cleared.'));
      return true;

    case 'history':
      if (messages.length === 0) {
        console.log(chalk.dim('No conversation history.'));
      } else {
        const userMsgs = messages.filter(m => m.role === 'user');
        const toolMsgs = messages.filter(m => {
          if (typeof m.content !== 'string' && Array.isArray(m.content)) {
            return m.content.some((b: any) => b.type === 'tool_result');
          }
          return false;
        });
        console.log(chalk.dim(`\n  ${messages.length} messages (${userMsgs.length} user turns, ${toolMsgs.length} tool results)\n`));

        messages.forEach((msg, i) => {
          let role: string;
          let icon: string;
          switch (msg.role) {
            case 'user':
              role = chalk.green('You');
              icon = chalk.green('▸');
              break;
            case 'assistant':
              role = chalk.cyan('Assistant');
              icon = chalk.cyan('◂');
              break;
            default:
              role = chalk.dim(msg.role);
              icon = chalk.dim('·');
          }

          if (typeof msg.content === 'string') {
            const preview = msg.content.substring(0, 120).replace(/\n/g, ' ');
            console.log(`  ${icon} ${role}: ${preview}${msg.content.length > 120 ? '...' : ''}`);
          } else if (Array.isArray(msg.content)) {
            const types = msg.content.map((b: any) => b.type).filter(Boolean);
            const toolUseCount = types.filter((t: string) => t === 'tool_use').length;
            const toolResultCount = types.filter((t: string) => t === 'tool_result').length;
            const parts: string[] = [];
            if (toolUseCount) parts.push(`${toolUseCount} tool_use`);
            if (toolResultCount) parts.push(`${toolResultCount} tool_result`);
            const textBlocks = msg.content.filter((b: any) => b.type === 'text');
            if (textBlocks.length) parts.push(`${textBlocks.length} text`);
            console.log(`  ${icon} ${role}: [${parts.join(', ')}]`);
          }
        });
        console.log();
      }
      return true;

    case 'provider':
      if (args[0]) {
        const newProvider = args[0];
        if (!config.providers[newProvider]) {
          console.log(chalk.red(`Provider not configured: ${newProvider}`));
          return true;
        }
        try {
          session.provider = createProvider(newProvider, config);
          session.providerName = newProvider;
          session.model = session.provider.getDefaultModel();
          console.log(chalk.green(`Switched to provider: ${newProvider}`));
          console.log(chalk.dim(`Model: ${session.model}`));
        } catch (error: any) {
          console.log(chalk.red(`Failed to switch provider: ${error.message || error}`));
        }
      } else {
        console.log(chalk.dim(`Current provider: ${session.providerName}`));
      }
      return true;

    case 'model':
      if (args[0]) {
        session.model = args[0];
        console.log(chalk.dim(`Model set to: ${session.model}`));
      } else {
        console.log(chalk.dim(`Current model: ${session.model}`));
        console.log(chalk.dim(`Available models: ${(await session.provider.listModels()).join(', ')}`));
      }
      return true;

    case 'tools':
      if (args[0] === 'enable' && args[1]) {
        console.log(chalk.green(`Tool '${args[1]}' enabled for this session`));
      } else if (args[0] === 'disable' && args[1]) {
        console.log(chalk.yellow(`Tool '${args[1]}' disabled for this session`));
      } else {
        const allTools = toolRegistry.getToolDefinitions(config.tools?.enabled);
        const enabledSet = new Set(config.tools?.enabled || allTools.map(t => t.name));

        // Categorize tools
        const fileTools = allTools.filter(t => ['read', 'write', 'edit', 'glob', 'grep'].includes(t.name));
        const execTools = allTools.filter(t => ['bash', 'agent'].includes(t.name));
        const webTools = allTools.filter(t => ['webfetch', 'websearch'].includes(t.name));

        const formatTool = (t: { name: string; description: string }) => {
          const enabled = enabledSet.has(t.name) ? chalk.green('✓') : chalk.dim('✗');
          return `  ${enabled} ${chalk.blue(t.name.padEnd(10))} ${chalk.dim(t.description)}`;
        };

        console.log(chalk.yellow('\n  Tools:'));
        if (fileTools.length) {
          console.log(chalk.dim('  Files:'));
          fileTools.forEach(t => console.log(formatTool(t)));
        }
        if (execTools.length) {
          console.log(chalk.dim('  Execution:'));
          execTools.forEach(t => console.log(formatTool(t)));
        }
        if (webTools.length) {
          console.log(chalk.dim('  Web:'));
          webTools.forEach(t => console.log(formatTool(t)));
        }
        console.log();
      }
      return true;

    case 'perf':
    case 'performance':
      if (perfMonitor.isEnabled()) {
        perfMonitor.printReport();
      } else {
        console.log(chalk.dim('Performance monitoring is disabled. Start with --monitor flag.'));
      }
      return true;

    case 'debug':
      const isDebugEnabled = logger['_level'] === 0; // LogLevel.DEBUG
      if (args[0] === 'on') {
        logger.setLevel(0); // LogLevel.DEBUG
        console.log(chalk.green('Debug mode enabled'));
      } else if (args[0] === 'off') {
        logger.setLevel(1); // LogLevel.INFO
        console.log(chalk.dim('Debug mode disabled'));
      } else {
        console.log(chalk.dim(`Debug mode: ${isDebugEnabled ? 'ON' : 'OFF'}`));
      }
      return true;

    case 'cost':
      const summary = costTracker.getSummary();
      if (costTracker.getSessionCost() === 0 && costTracker.getRecords().length === 0) {
        console.log(chalk.dim('No cost data recorded yet. Costs are estimated from provider-reported token usage.'));
      } else {
        console.log(chalk.yellow('Session cost summary:'));
        console.log(summary);
        console.log(chalk.dim('\nNote: Costs are estimates based on published pricing.'));
      }
      return true;

    case 'save':
      const savePath = args[0] || `dragon-session-${Date.now()}.json`;
      try {
        const fs = await import('fs');
        const saveData = messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
        const homeDir = process.env.HOME || '~';
        const fullPath = savePath.startsWith('/') ? savePath : `${homeDir}/.dragon/history/${savePath}`;
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(fullPath, JSON.stringify(saveData, null, 2), { mode: 0o600 });
        console.log(chalk.green(`Session saved to ${fullPath}`));
      } catch (err: any) {
        console.log(chalk.red(`Failed to save: ${err.message}`));
      }
      return true;

    case 'load':
      const loadPath = args[0];
      if (!loadPath) {
        console.log(chalk.red('Usage: /load <filename>'));
        return true;
      }
      try {
        const fs = await import('fs');
        const homeDir = process.env.HOME || '~';
        const fullPath = loadPath.startsWith('/') ? loadPath : `${homeDir}/.dragon/history/${loadPath}`;
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const loaded = JSON.parse(raw);
        if (!Array.isArray(loaded)) {
          console.log(chalk.red('Invalid session file format.'));
          return true;
        }
        messages.length = 0;
        messages.push(...loaded.map((m: any) => ({
          role: m.role,
          content: m.content,
        })));
        console.log(chalk.green(`Loaded ${messages.length} messages from ${fullPath}`));
      } catch (err: any) {
        console.log(chalk.red(`Failed to load: ${err.message}`));
      }
      return true;

    case 'encrypt':
      console.log(chalk.yellow('To enable encryption, run: dragon init --encrypt'));
      return true;

    case 'exit':
    case 'quit':
      return false;

    case 'auto':
      if (args[0] === 'out' || args[0] === 'outside') {
        session.autoApproveOutsideWorkspace = !session.autoApproveOutsideWorkspace;
        if (session.autoApproveOutsideWorkspace) {
          console.log(chalk.yellow('  ⚠ Out-of-workspace access auto-approved.'));
          console.log(chalk.dim('  /auto out to require confirmation again.'));
        } else {
          console.log(chalk.green('  ✓ Out-of-workspace access requires confirmation.'));
        }
      } else {
        session.autoApproveTools = !session.autoApproveTools;
        if (session.autoApproveTools) {
          session.autoApproveOutsideWorkspace = true;
          console.log(chalk.yellow('  ⚠ Auto-approve ALL tools.'));
          console.log(chalk.dim('  /auto to disable. /ask to require confirmation for all.'));
        } else {
          session.autoApproveOutsideWorkspace = false;
          console.log(chalk.green('  ✓ Confirmation required for all dangerous tools.'));
          console.log(chalk.dim('  y=approve once  a=auto-approve  n=deny'));
        }
      }
      return true;

    case 'ask':
      session.autoApproveTools = false;
      session.autoApproveOutsideWorkspace = false;
      console.log(chalk.green('  ✓ All dangerous tools require confirmation.'));
      console.log(chalk.dim('  y=approve once  a=auto-approve all  n=deny'));
      return true;

    case 'workspace':
    case 'ws':
      return await handleWorkspaceCommand(args, config, toolRegistry);

    case 'save-tokens':
    case 'eco': {
      const targetLevel = args[0]?.toLowerCase() as TokenSaveLevel | undefined;

      if (targetLevel && ['off', 'mild', 'moderate', 'aggressive'].includes(targetLevel)) {
        session.tokenSaveLevel = targetLevel;
        const cfg = TOKEN_SAVE_CONFIGS[targetLevel];
        if (targetLevel === 'off') {
          console.log(chalk.dim('  Token-saving OFF — full quality restored.'));
        } else {
          console.log(chalk.green(`  ✓ Token-saving: ${cfg.label}`));
          if (cfg.modelSuffix) console.log(chalk.dim(`  Model: ${cfg.modelSuffix}`));
          if (!cfg.cacheControl) console.log(chalk.dim('  Cache writes: off'));
          if (cfg.limitTools) console.log(chalk.dim('  Tools: file ops only (no web/agent)'));
        }
      } else if (targetLevel) {
        console.log(chalk.red(`  Unknown level: ${targetLevel}. Use: off, mild, moderate, aggressive`));
      } else {
        // Show menu
        const current = session.tokenSaveLevel;
        const levels: TokenSaveLevel[] = ['off', 'mild', 'moderate', 'aggressive'];
        console.log(chalk.yellow('\n  Token saving levels:'));
        for (const lv of levels) {
          const cfg = TOKEN_SAVE_CONFIGS[lv];
          const marker = current === lv ? chalk.green(' ●') : '  ';
          const label = current === lv ? chalk.bold(cfg.label) : chalk.dim(cfg.label);
          console.log(`${marker} ${chalk.cyan(`/save-tokens ${lv}`.padEnd(21))} ${label}`);
        }
        console.log(chalk.dim('\n  Higher levels trade reasoning depth for token efficiency.'));
        console.log();
      }
      session.tokenSavePrompted = true;
      return true;
    }

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      return true;
  }
}
