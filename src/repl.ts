import * as readline from 'readline';
import chalk from 'chalk';
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
  const sessionState = {
    provider: null as unknown as AIProvider,
    providerName: options.provider || '',
    model: options.model,
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

    console.log(chalk.dim(`Provider: ${providerName}`));
    console.log(chalk.dim(`Model: ${sessionState.model}`));
    console.log();
    console.log(chalk.dim('Type your message and press Enter. Type /help for commands.'));
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
          const response = await handleChat(messages, tools, sessionState.provider, toolRegistry, sessionState.model);
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

async function handleChat(
  messages: Message[],
  tools: any[],
  provider: AIProvider,
  toolRegistry: ToolRegistry,
  model?: string
): Promise<{ messages: Message[] }> {
  let currentMessages = [...messages];

  // Reset per-turn tool call counter
  toolRegistry.resetTurnCounter();

  while (true) {
    process.stdout.write(chalk.cyan('\n'));

    let fullContent = '';
    const toolCalls: ToolCall[] = [];
    let lastUsage: { inputTokens?: number; outputTokens?: number } | null = null;

    try {
      const streamStartTime = performance.now();

      for await (const chunk of provider.stream(currentMessages, tools, { model })) {
        if (chunk.type === 'text' && chunk.text) {
          process.stdout.write(chunk.text);
          fullContent += chunk.text;
        } else if (chunk.type === 'tool_use' && chunk.toolCall && chunk.isComplete) {
          toolCalls.push(chunk.toolCall as ToolCall);
        }
        // Capture usage from last chunk if available
        if ((chunk as any).usage) {
          lastUsage = (chunk as any).usage;
        }
      }

      const streamDuration = performance.now() - streamStartTime;
      logger.debug(`Stream completed in ${streamDuration.toFixed(2)}ms`);

    } catch (error: any) {
      const wrapped = wrapError(error, 'Stream error');
      logger.error('Stream error', wrapped);
      console.error(chalk.red(`\nStream error: ${error.message || error}`));

      // For rate limits, suggest waiting
      if (error.message?.includes('rate') || error.status === 429) {
        console.log(chalk.yellow('Rate limit hit. Try again in a moment, or switch model with /model.'));
      }

      throw error;
    }

    console.log();

    // Track cost if usage data available
    if (lastUsage?.inputTokens && lastUsage?.outputTokens) {
      costTracker.record(
        model || provider.getDefaultModel(),
        lastUsage.inputTokens,
        lastUsage.outputTokens
      );
    }

    currentMessages.push({
      role: 'assistant',
      content: fullContent || '',
    });

    if (toolCalls.length > 0) {
      console.log(chalk.dim(`\nExecuting ${toolCalls.length} tool call(s)...`));

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

      // Build user message with tool results
      const toolResults: any[] = [];
      for (const tc of toolCalls) {
        console.log(chalk.blue(`  → ${tc.name}`));

        perfMonitor.startTimer(`tool:${tc.name}`);
        const result = await toolRegistry.executeToolCall(tc);
        perfMonitor.endTimer(`tool:${tc.name}`);

        if (result.success) {
          console.log(chalk.green(`  ✓ ${tc.name} completed`));
        } else {
          const errMsg = result.error || 'unknown error';
          console.log(chalk.red(`  ✗ ${tc.name} failed: ${errMsg}`));
          // If tool call limit reached, stop the loop
          if (errMsg.includes('limit')) {
            console.log(chalk.yellow('Tool execution limit reached. Consider simplifying your request.'));
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: result.output,
          is_error: !result.success,
        });
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

interface SessionState {
  provider: AIProvider;
  providerName: string;
  model?: string;
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
      console.log(chalk.yellow('Available commands:'));
      console.log('  /help       - Show this help message');
      console.log('  /clear      - Clear conversation history');
      console.log('  /history    - Show conversation history');
      console.log('  /provider   - Show or change provider');
      console.log('  /model      - Show or change model');
      console.log('  /tools      - List available tools');
      console.log('  /cost       - Show API usage and cost estimate');
      console.log('  /save       - Save conversation to file');
      console.log('  /load       - Load conversation from file');
      console.log('  /perf       - Show performance report');
      console.log('  /debug      - Toggle debug mode (on/off)');
      console.log('  /encrypt    - Show encryption info');
      console.log('  /exit       - Exit the REPL');
      return true;

    case 'clear':
      messages.length = 0;
      console.log(chalk.dim('Conversation cleared.'));
      return true;

    case 'history':
      if (messages.length === 0) {
        console.log(chalk.dim('No conversation history.'));
      } else {
        messages.forEach((msg, i) => {
          const role = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Assistant');
          const content = typeof msg.content === 'string' ? msg.content.substring(0, 100) : '[complex content]';
          console.log(`${role}: ${content}${content.length >= 100 ? '...' : ''}`);
        });
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
        // Note: This is a session-only change, doesn't persist to config
        console.log(chalk.green(`Tool '${args[1]}' enabled for this session`));
      } else if (args[0] === 'disable' && args[1]) {
        console.log(chalk.yellow(`Tool '${args[1]}' disabled for this session`));
      } else {
        const tools = toolRegistry.getToolDefinitions();
        console.log(chalk.yellow('Available tools:'));
        tools.forEach(tool => {
          console.log(`  ${chalk.blue(tool.name)}: ${tool.description}`);
        });
        console.log(chalk.dim('Use /tools enable <name> or /tools disable <name> to modify session tools'));
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

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      return true;
  }
}
