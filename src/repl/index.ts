/**
 * REPL main entry point
 */

import * as readline from 'readline';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import type { DragonConfig } from '../config/index.js';
import { detectAndMigrateClaudeEnv } from '../config/claude-sync.js';
import { createProvider } from '../providers/index.js';
import type { AIProvider } from '../providers/index.js';
import { ToolRegistry, createToolRegistry } from '../tools/index.js';
import { getLogger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';
import { perfMonitor } from '../performance/index.js';
import { loadAllSkills, buildSkillsPrompt } from '../skills/index.js';
import { handleCommand } from './commands.js';
import { handleChat } from './chat-loop.js';
import { setSystemPrompt } from './chat-loop.js';
import { promptWorkspaceInit } from './prompts.js';
import {
  AUTOGEN_PROMPT,
  ReplOptions,
  SessionState,
  TokenSaveLevel,
} from './config.js';
import { InputQueueManager } from './input-queue.js';
import { getCompletions, getSubCompletions, getHints } from './command-registry.js';
import { getAutoGenState, setAutoGenState } from './handlers.js';

const logger = getLogger();

let autoGenTimer: ReturnType<typeof setInterval> | null = null;

function loadSystemPrompt(cwd: string): string {
  const parts: string[] = [];

  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    try {
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      if (content.length > 50000) {
        parts.push(content.substring(0, 50000) + '\n\n... (CLAUDE.md truncated at 50K characters)');
        logger.warn(`CLAUDE.md exceeds 50K chars (${content.length}), truncated`);
      } else {
        parts.push(content);
      }
      logger.debug(`Loaded CLAUDE.md (${Math.min(content.length, 50000)} chars)`);
    } catch (err: any) {
      logger.warn(`Failed to read CLAUDE.md: ${err.message}`);
    }
  }

  const settingsLocalPath = path.join(cwd, '.claude', 'settings.local.json');
  if (fs.existsSync(settingsLocalPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf-8'));
      if (settings.systemPrompt && typeof settings.systemPrompt === 'string') {
        parts.push(settings.systemPrompt);
        logger.debug(`Loaded system prompt from .claude/settings.local.json`);
      }
    } catch {}
  }

  return parts.join('\n\n');
}

export async function startRepl(options: ReplOptions = {}): Promise<void> {
  let config: DragonConfig;
  let provider: AIProvider;
  let toolRegistry: ToolRegistry;
  let messages: any[] = [];
  const sessionState: SessionState = {
    provider: null as unknown as AIProvider,
    providerName: options.provider || '',
    model: options.model,
    autoApproveTools: false,
    autoApproveOutsideWorkspace: false,
    tokenSaveLevel: (options.tokenSaveLevel as TokenSaveLevel) || 'off',
    tokenSavePrompted: !!options.tokenSaveLevel,
  };

  // Input queue for concurrent input during streaming
  const inputQueue = new InputQueueManager();

  if (options.enableMonitoring) {
    perfMonitor.setEnabled(true);
    logger.info('Performance monitoring enabled');
  }

  try {
    config = await loadConfig(options.enableEncryption);
    await detectAndMigrateClaudeEnv(config, options.enableEncryption);
    const providerName = options.provider || config.defaultProvider;
    provider = createProvider(providerName, config);
    sessionState.provider = provider;
    sessionState.providerName = providerName;
    sessionState.model = options.model || provider.getDefaultModel();

    if (!options.tokenSaveLevel && config.defaultTokenSaveLevel && config.defaultTokenSaveLevel !== 'off') {
      sessionState.tokenSaveLevel = config.defaultTokenSaveLevel as TokenSaveLevel;
      sessionState.tokenSavePrompted = true;
    }

    toolRegistry = createToolRegistry(process.cwd());
    toolRegistry.setProvider(provider);

    if (config.tools?.bash?.dangerouslyDisableSandbox) {
      toolRegistry.setPermissions(['bash:allow-dangerous']);
    }

    if (config.workspace?.enforceBounds && config.workspace.paths.length > 0) {
      toolRegistry.setWorkspaceScope(
        config.workspace.paths,
        config.workspace.allowHomeDir
          ? [...config.workspace.paths, process.env.HOME || os.homedir()].filter(Boolean)
          : config.workspace.paths
      );
      sessionState.autoApproveTools = true;
    }

    // Prompt for workspace
    const cwd = process.cwd();
    const cwdInWorkspace = config.workspace?.paths?.some(p => path.resolve(p) === cwd);
    if (!cwdInWorkspace) {
      const useAsWorkspace = await promptWorkspaceInit(cwd);
      if (useAsWorkspace) {
        if (!config.workspace) {
          config.workspace = { paths: [], writeEnabled: true, enforceBounds: true, allowHomeDir: true };
        }
        config.workspace.paths = [...(config.workspace.paths || []), cwd];
        config.workspace.enforceBounds = true;
        toolRegistry.setWorkspaceScope(config.workspace.paths);
        sessionState.autoApproveTools = true;
        try {
          const { saveConfig } = await import('../config/index.js');
          saveConfig(config);
        } catch {}
      }
    }

    let systemPrompt = loadSystemPrompt(process.cwd());
    const skills = loadAllSkills();
    const skillsPrompt = buildSkillsPrompt(skills);
    if (skillsPrompt) {
      systemPrompt = systemPrompt + skillsPrompt;
      toolRegistry.setSkills(skills);
    }
    setSystemPrompt(systemPrompt);

    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      try {
        await toolRegistry.initializeMcpServers(config.mcpServers);
        logger.info('MCP servers initialized');
      } catch (err: any) {
        logger.warn(`MCP initialization failed: ${err.message}`);
      }
    }

    const toolCount = toolRegistry.getToolDefinitions(config.tools?.enabled).length;
    console.log(chalk.dim(`  Provider: ${providerName}  ·  Model: ${sessionState.model}`));
    console.log(chalk.dim(`  Tools: ${toolCount}  ·  /help for commands`));
    console.log();

    if (config.autoSkill?.enabled && config.autoSkill.intervalMinutes >= 5) {
      autoGenTimer = setInterval(() => {
        const userMsgCount = messages.filter(m => m.role === 'user').length;
        const { lastIndex } = getAutoGenState();
        if (userMsgCount > 0 && messages.length > lastIndex) {
          setAutoGenState(true, messages.length);
        }
      }, config.autoSkill.intervalMinutes * 60 * 1000);
    }

  } catch (error: any) {
    logger.error('Failed to initialize', error);
    console.error(chalk.red(`Init error: ${error.message || error}`));
    process.exit(1);
  }

  const isInteractive = process.stdin.isTTY;
  let shouldKeepRunning = true;
  let isProcessing = false; // Flag to track when processing input

  // SIGINT counter for double-press exit
  let sigintCount = 0;

  process.on('uncaughtException', (error) => {
    console.error(chalk.red('\n  Unexpected error:'), error.message || error);
    logger.error('Uncaught exception', error);
    if (isInteractive && rl) rl.prompt();
  });
  process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('\n  Unhandled promise rejection:'), String(reason));
    logger.error('Unhandled rejection', reason);
    if (isInteractive && rl) rl.prompt();
  });

  /**
   * Process a single input (command or chat message)
   */
  async function processInput(
    input: string,
    messages: any[],
    config: DragonConfig,
    toolRegistry: ToolRegistry,
    session: SessionState,
    provider: AIProvider,
    inputQueue: InputQueueManager,
  ): Promise<boolean> {
    // Empty input
    if (!input) {
      return true;
    }

    // Handle commands immediately (not queued)
    if (input.startsWith('/')) {
      // Show hint for partial commands
      const hint = getHints(input);
      if (hint) {
        console.log(chalk.dim(`  Hint: ${hint}`));
      }

      const keepRunning = await handleCommand(input, config, messages, toolRegistry, session);
      if (!keepRunning) {
        return false; // Exit requested
      }
      return true;
    }

    // Normal chat - process with streaming
    messages.push({ role: 'user', content: input });

    try {
      const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
      const abortController = inputQueue.startStreaming();
      const response = await handleChat(
        messages,
        tools,
        provider,
        toolRegistry,
        session.model,
        session.autoApproveTools,
        session.tokenSaveLevel,
        session,
        session.autoApproveOutsideWorkspace,
        config.workspace?.paths || [],
        abortController.signal,
        inputQueue,
      );
      messages = response.messages;
      console.log();

      // If stream was aborted, check for pending inputs
      if (response.wasAborted) {
        console.log(chalk.dim('  Response interrupted. Checking for queued inputs...'));
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }

    return true;
  }

  /**
   * Process all pending queued inputs sequentially
   */
  async function processPendingInputs(): Promise<boolean> {
    const pendingInputs = inputQueue.getPendingInputs();

    if (pendingInputs.length > 0) {
      console.log(chalk.dim(`  Processing ${pendingInputs.length} queued message(s)...`));

      for (const queuedInput of pendingInputs) {
        console.log(chalk.cyan(`\n> ${queuedInput.substring(0, 50)}${queuedInput.length > 50 ? '...' : ''}`));
        const keepRunning = await processInput(
          queuedInput,
          messages,
          config,
          toolRegistry,
          sessionState,
          provider,
          inputQueue,
        );
        if (!keepRunning) {
          return false;
        }
      }
    }

    return true;
  }

  function createReadline() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
      terminal: true,
      // Tab completion for commands
      completer: (line: string): [string[], string] => {
        const cmdCompletions = getCompletions(line);
        const subCompletions = getSubCompletions(line);
        const allCompletions = [...cmdCompletions, ...subCompletions];
        return [allCompletions.length > 0 ? allCompletions : [line], line];
      },
    });
  }

  function attachLineHandler(rl: readline.Interface) {
    // Handle Ctrl+C on readline directly (readline captures SIGINT when terminal: true)
    rl.on('SIGINT', () => {
      // During streaming: abort the stream
      if (inputQueue.isStreaming()) {
        const aborted = inputQueue.abortStream();
        if (aborted) {
          console.log(chalk.dim('\n  Stream cancelled. Queued inputs preserved.'));
        } else {
          console.log(chalk.dim('\n  Processing... Press Ctrl+C again after completion to exit.'));
        }
        sigintCount++;
        return;
      }

      // During non-streaming processing: show message
      if (isProcessing) {
        console.log(chalk.dim('\n  Currently processing. Please wait or press Ctrl+C again to force exit.'));
        sigintCount++;
        if (sigintCount >= 2) {
          if (autoGenTimer) clearInterval(autoGenTimer);
          console.log(chalk.dim('\nGoodbye!'));
          rl.close();
          process.exit(0);
        }
        setTimeout(() => { sigintCount = 0; }, 2000);
        return;
      }

      sigintCount++;
      if (sigintCount === 1) {
        console.log(chalk.dim('\n  Press Ctrl+C again to exit, or type /exit to quit'));
        rl.prompt();
      } else {
        if (autoGenTimer) clearInterval(autoGenTimer);
        console.log(chalk.dim('\nGoodbye!'));
        rl.close();
        process.exit(0);
      }
      setTimeout(() => { sigintCount = 0; }, 2000);
    });

    rl.on('line', async (line: string) => {
      const input = line.trim();

      // During streaming: queue input and show acknowledgment
      if (inputQueue.isStreaming()) {
        if (input.startsWith('/')) {
          // Commands can be processed immediately during streaming
          const hint = getHints(input);
          if (hint) {
            console.log(chalk.dim(`  Hint: ${hint}`));
          }
          const keepRunning = await handleCommand(input, config, messages, toolRegistry, sessionState);
          if (!keepRunning) {
            shouldKeepRunning = false;
            if (autoGenTimer) clearInterval(autoGenTimer);
            await toolRegistry.disconnectMcp();
            rl.close();
            process.exit(0);
            return;
          }
          rl.prompt();
        } else if (input) {
          // Chat messages are queued
          inputQueue.queueInput(input);
          const preview = input.substring(0, 30);
          console.log(chalk.dim(`\n  [Queued: "${preview}${input.length > 30 ? '...' : ''}" - will process after current response]\n`));
          rl.prompt();
        } else {
          rl.prompt();
        }
        return;
      }

      // During non-streaming processing: skip input (already busy)
      if (isProcessing) {
        if (input) {
          console.log(chalk.dim(`\n  [Busy processing, input ignored. Press Ctrl+C to cancel.]\n`));
        }
        rl.prompt();
        return;
      }

      // Normal processing (not streaming)
      isProcessing = true;

      try {
        // Handle empty input - just show prompt
        if (!input) {
          // Check for pending autogen - process if needed
          const { pending } = getAutoGenState();
          if (pending) {
            setAutoGenState(false, 0);
            console.log(chalk.dim('\n  Processing autogen request...\n'));
            try {
              const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
              const abortController = inputQueue.startStreaming();
              const response = await handleChat(
                messages,
                tools,
                provider,
                toolRegistry,
                sessionState.model,
                sessionState.autoApproveTools,
                sessionState.tokenSaveLevel,
                sessionState,
                sessionState.autoApproveOutsideWorkspace,
                config.workspace?.paths || [],
                abortController.signal,
                inputQueue,
              );
              messages = response.messages;
              setAutoGenState(false, messages.length);
              console.log();
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
              setAutoGenState(false, 0);
            }
          }
          isProcessing = false;
          rl.prompt();
          return;
        }

        // Handle commands
        if (input.startsWith('/')) {
          const hint = getHints(input);
          if (hint) {
            console.log(chalk.dim(`  Hint: ${hint}`));
          }

          const keepRunning = await handleCommand(input, config, messages, toolRegistry, sessionState);
          if (!keepRunning) {
            shouldKeepRunning = false;
            if (autoGenTimer) clearInterval(autoGenTimer);
            await toolRegistry.disconnectMcp();
            rl.close();
            process.exit(0);
            return;
          }

          // After command, check for pending autogen (set by /skills autogen)
          const { pending } = getAutoGenState();
          if (pending) {
            setAutoGenState(false, 0);
            console.log(chalk.dim('\n  Processing autogen request...\n'));
            try {
              const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
              const abortController = inputQueue.startStreaming();
              const response = await handleChat(
                messages,
                tools,
                provider,
                toolRegistry,
                sessionState.model,
                sessionState.autoApproveTools,
                sessionState.tokenSaveLevel,
                sessionState,
                sessionState.autoApproveOutsideWorkspace,
                config.workspace?.paths || [],
                abortController.signal,
                inputQueue,
              );
              messages = response.messages;
              setAutoGenState(false, messages.length);
              console.log();
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
              setAutoGenState(false, 0);
            }
          }

          isProcessing = false;
          rl.prompt();
          return;
        }

        // Normal chat - process with streaming
        messages.push({ role: 'user', content: input });

        try {
          const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
          const abortController = inputQueue.startStreaming();
          const response = await handleChat(
            messages,
            tools,
            provider,
            toolRegistry,
            sessionState.model,
            sessionState.autoApproveTools,
            sessionState.tokenSaveLevel,
            sessionState,
            sessionState.autoApproveOutsideWorkspace,
            config.workspace?.paths || [],
            abortController.signal,
            inputQueue,
          );
          messages = response.messages;
          console.log();

          if (response.wasAborted) {
            console.log(chalk.dim('  Response interrupted. Checking for queued inputs...'));
          }
        } catch (error: any) {
          console.error(chalk.red('Error:'), error.message);
        }

        // Process any queued inputs after current response
        const continueRunning = await processPendingInputs();
        if (!continueRunning) {
          shouldKeepRunning = false;
          if (autoGenTimer) clearInterval(autoGenTimer);
          await toolRegistry.disconnectMcp();
          rl.close();
          process.exit(0);
          return;
        }

        isProcessing = false;
        rl.prompt();
      } catch (error: any) {
        console.error(chalk.red('Error:'), error.message);
        isProcessing = false;
        rl.prompt();
      }
    });
  }

  function attachCloseHandler(rl: readline.Interface) {
    rl.on('close', () => {
      // Don't exit if we're still streaming - readline will be recreated
      if (inputQueue.isStreaming()) {
        logger.debug('Ignored close event during streaming');
        return;
      }

      // Only exit if shouldKeepRunning is false (user requested exit)
      if (!shouldKeepRunning) {
        if (autoGenTimer) clearInterval(autoGenTimer);
        console.log(chalk.dim('\nGoodbye!'));
        process.exit(0);
        return;
      }

      // If stdin is destroyed (Ctrl+D), exit
      if (process.stdin.destroyed) {
        if (autoGenTimer) clearInterval(autoGenTimer);
        console.log(chalk.dim('\nGoodbye!'));
        process.exit(0);
        return;
      }

      // Otherwise, this was an unexpected close - recreate and continue
      logger.debug('Recreating readline after unexpected close');
      rl = createReadline();
      attachLineHandler(rl);
      attachCloseHandler(rl);
      rl.prompt();
    });
  }

  let rl: readline.Interface;

  if (!isInteractive) {
    // Piped mode - accumulate all lines then process
    rl = createReadline();
    const lines: string[] = [];
    rl.on('line', (line: string) => lines.push(line));
    rl.on('close', async () => {
      for (const line of lines) {
        const input = line.trim();
        if (!input) continue;
        const keepRunning = await processInput(input, messages, config, toolRegistry, sessionState, provider, inputQueue);
        if (!keepRunning) break;
      }
      await toolRegistry.disconnectMcp();
      console.log(chalk.dim('\nGoodbye!'));
      process.exit(0);
    });
  } else {
    // Interactive mode
    rl = createReadline();
    attachLineHandler(rl);
    attachCloseHandler(rl);
    rl.prompt();
  }
}