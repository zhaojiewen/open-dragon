import * as readline from 'readline';
import chalk from 'chalk';
import { loadConfig, DragonConfig } from './config/index.js';
import { createProvider, AIProvider } from './providers/index.js';
import { ToolRegistry, createToolRegistry } from './tools/index.js';
import { Message, AIResponse, ToolCall } from './providers/base.js';

interface ReplOptions {
  provider?: string;
  model?: string;
}

export async function startRepl(options: ReplOptions = {}): Promise<void> {
  let config: DragonConfig;
  let provider: AIProvider;
  let toolRegistry: ToolRegistry;
  let messages: Message[] = [];

  try {
    config = await loadConfig();
    const providerName = options.provider || config.defaultProvider;
    provider = createProvider(providerName, config);
    toolRegistry = createToolRegistry(process.cwd());
    toolRegistry.setProvider(provider);

    console.log(chalk.dim(`Provider: ${providerName}`));
    console.log(chalk.dim(`Model: ${options.model || provider.getDefaultModel()}`));
    console.log();
    console.log(chalk.dim('Type your message and press Enter. Type /help for commands.'));
    console.log();
  } catch (error: any) {
    console.error(chalk.red('Failed to initialize:'), error.message);
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
      for await (const chunk of provider.stream(currentMessages, tools, { model })) {
        if (chunk.type === 'text' && chunk.text) {
          process.stdout.write(chunk.text);
          fullContent += chunk.text;
        } else if (chunk.type === 'tool_use' && chunk.toolCall && chunk.isComplete) {
          toolCalls.push(chunk.toolCall as ToolCall);
        }
      }
    } catch (error: any) {
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

        const result = await toolRegistry.executeToolCall(tc);

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

    case 'exit':
    case 'quit':
      return true;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      return true;
  }
}
