import * as readline from 'readline';
import chalk from 'chalk';
import { loadConfig, DragonConfig } from './config/index.js';
import { createProvider, AIProvider } from './providers/index.js';
import { ToolRegistry, createToolRegistry } from './tools/index.js';
import { Message, AIResponse, ToolCall } from './providers/base.js';
import { DragonError, ConfigError, wrapError } from './utils/errors.js';
import { getLogger } from './utils/logger.js';
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
    
    toolRegistry = createToolRegistry(process.cwd());
    toolRegistry.setProvider(provider);

    console.log(chalk.dim(`Provider: ${providerName}`));
    console.log(chalk.dim(`Model: ${options.model || provider.getDefaultModel()}`));
    console.log();
    console.log(chalk.dim('Type your message and press Enter. Type /help for commands.'));
    console.log();
  } catch (error: any) {
    const wrappedError = wrapError(error, 'Initialization failed');
    logger.error('Failed to initialize', error);
    
    if (wrappedError instanceof ConfigError) {
      console.log(chalk.yellow('No configuration found. Run `dragon init` first.'));
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
          await handleCommand(input, config, messages, provider, toolRegistry);
          continue;
        }

        messages.push({ role: 'user', content: input });

        try {
          const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
          const response = await handleChat(messages, tools, provider, toolRegistry, options.model);
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
        await handleCommand(input, config, messages, provider, toolRegistry);
        rl.prompt();
        return;
      }

      messages.push({ role: 'user', content: input });

      try {
        const tools = toolRegistry.getToolDefinitions(config.tools?.enabled);
        const response = await handleChat(messages, tools, provider, toolRegistry, options.model);
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

  while (true) {
    process.stdout.write(chalk.cyan('\n'));

    let fullContent = '';
    const toolCalls: ToolCall[] = [];

    try {
      // Measure streaming performance
      const streamStartTime = performance.now();
      
      for await (const chunk of provider.stream(currentMessages, tools, { model })) {
        if (chunk.type === 'text' && chunk.text) {
          process.stdout.write(chunk.text);
          fullContent += chunk.text;
        } else if (chunk.type === 'tool_use' && chunk.toolCall && chunk.isComplete) {
          toolCalls.push(chunk.toolCall as ToolCall);
        }
      }
      
      const streamDuration = performance.now() - streamStartTime;
      logger.debug(`Stream completed in ${streamDuration.toFixed(2)}ms`);
      
    } catch (error: any) {
      logger.error('Stream error', error);
      throw error;
    }

    console.log();

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

        // Measure tool execution performance
        perfMonitor.startTimer(`tool:${tc.name}`);
        const result = await toolRegistry.executeToolCall(tc);
        perfMonitor.endTimer(`tool:${tc.name}`);

        if (result.success) {
          console.log(chalk.green(`  ✓ ${tc.name} completed`));
        } else {
          console.log(chalk.red(`  ✗ ${tc.name} failed: ${result.error}`));
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

async function handleCommand(
  input: string,
  config: DragonConfig,
  messages: Message[],
  provider: AIProvider,
  toolRegistry: ToolRegistry
): Promise<boolean> {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
      console.log(chalk.yellow('Available commands:'));
      console.log('  /help       - Show this help message');
      console.log('  /clear      - Clear conversation history');
      console.log('  /history    - Show conversation history');
      console.log('  /provider   - Show current provider');
      console.log('  /model      - Show or change model');
      console.log('  /tools      - List available tools');
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
      console.log(chalk.dim(`Current provider: ${provider.name}`));
      return true;

    case 'model':
      if (args[0]) {
        console.log(chalk.dim(`Model: ${args[0]}`));
      } else {
        console.log(chalk.dim(`Current model: ${provider.getDefaultModel()}`));
        console.log(chalk.dim(`Available models: ${(await provider.listModels()).join(', ')}`));
      }
      return true;

    case 'tools':
      const tools = toolRegistry.getToolDefinitions();
      console.log(chalk.yellow('Available tools:'));
      tools.forEach(tool => {
        console.log(`  ${chalk.blue(tool.name)}: ${tool.description}`);
      });
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

    case 'encrypt':
      console.log(chalk.yellow('To enable encryption, run: dragon init --encrypt'));
      return true;

    case 'exit':
    case 'quit':
      return true;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      return true;
  }
}
