#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { stdin as stdinStream, stdout as stdoutStream } from 'process';
import { program } from 'commander';
import { startRepl } from './repl.js';
import { loadConfig, initConfig } from './config/index.js';
import { encryptionService } from './encryption/index.js';
import { getLogger, LogLevel } from './utils/logger.js';
import chalk from 'chalk';
import figlet from 'figlet';

const VERSION = '1.2.0';
const logger = getLogger();

// Handle environment variables
if (process.env.DRAGON_DEBUG === 'true') {
  logger.setLevel(LogLevel.DEBUG);
  logger.debug('Debug mode enabled');
}

program
  .name('dragon')
  .description('Multi-provider AI CLI tool powered by Claude API - your intelligent coding companion')
  .version(VERSION)
  .option('--monitor', 'Enable performance monitoring');

async function promptPassword(): Promise<string> {
  if (!stdinStream.isTTY) {
    throw new Error('Cannot securely prompt for password in a non-interactive shell. Use DRAGON_PASSWORD env var.');
  }

  const { createInterface } = await import('readline/promises');
  const rl = createInterface({
    input: stdinStream,
    output: stdoutStream,
  });

  const password = await rl.question('Encryption password: ');
  const confirm = await rl.question('Confirm password: ');
  rl.close();

  if (!password || password !== confirm) {
    throw new Error('Passwords do not match or are empty.');
  }
  return password;
}

program
  .command('init')
  .description('Initialize configuration file')
  .option('-f, --force', 'Force overwrite existing config')
  .option('-e, --encrypt', 'Encrypt sensitive fields in config')
  .option('-p, --password <password>', 'Password for encryption (WARNING: visible in shell history)')
  .action(async (options) => {
    try {
      // Initialize encryption if requested
      if (options.encrypt) {
        // Prefer DRAGON_PASSWORD env var, then --password flag, then TTY prompt
        let password = process.env.DRAGON_PASSWORD || options.password;

        if (options.password) {
          console.log(chalk.yellow('⚠ Warning: --password exposes your password in shell history.'));
          console.log(chalk.dim('Use DRAGON_PASSWORD environment variable or TTY prompt for more security.'));
        }

        if (!password) {
          password = await promptPassword();
        }
        await encryptionService.initialize(password);
        logger.info('Encryption enabled for sensitive fields');
      }

      await initConfig(options.force, options.encrypt);
      console.log(chalk.green('✓ Configuration initialized!'));

      if (options.encrypt) {
        console.log(chalk.dim('Note: API keys will be encrypted. Keep your password safe!'));
      } else {
        console.log(chalk.dim('Edit ~/.dragon/config.json to add your API keys'));
      }
    } catch (error: any) {
      logger.error('Failed to initialize config', error);
      process.exit(1);
    }
  });

program
  .command('config [action]')
  .description('Show or edit configuration file')
  .action(async (action) => {
    const configPath = process.env.HOME + '/.dragon/config.json';

    switch (action) {
      case 'edit': {
        const editor = process.env.EDITOR || 'vi';
        console.log(chalk.dim(`Opening config in ${editor}: ${configPath}`));
        spawnSync(editor, [configPath], { stdio: 'inherit' });
        return;
      }
      case 'show': {
        console.log(chalk.dim(`Config file: ${configPath}`));
        try {
          const fs = await import('fs');
          const config = fs.readFileSync(configPath, 'utf-8');
          console.log(config);
        } catch (error: any) {
          console.error(chalk.red(`Unable to read config: ${error.message || error}`));
        }
        return;
      }
      case 'validate': {
        try {
          const configModule = await import('./config/index.js');
          const config = await configModule.loadConfig();
          const result = configModule.validateConfig(config);
          if (result.valid) {
            console.log(chalk.green('✓ Configuration is valid'));
          } else {
            console.log(chalk.red('✗ Configuration has errors:'));
            result.errors.forEach((err: string) => console.log(chalk.red(`  - ${err}`)));
          }
        } catch (error: any) {
          console.error(chalk.red(`Unable to validate config: ${error.message || error}`));
        }
        return;
      }
      default:
        console.log(chalk.dim(`Config file: ${configPath}`));
        console.log(chalk.yellow('Run `dragon config edit` to open it in your editor.'));
        console.log(chalk.yellow('Run `dragon config validate` to check configuration.'));
        return;
    }
  });

program
  .command('chat')
  .description('Start interactive chat session')
  .option('-p, --provider <provider>', 'AI provider to use')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    try {
      const useEncryption = !!process.env.DRAGON_PASSWORD;
      const config = await loadConfig(useEncryption);
      const provider = options.provider || config.defaultProvider;
      const globalOptions = program.opts();
      await startRepl({ provider, model: options.model, enableMonitoring: globalOptions.monitor });
    } catch (error: any) {
      const msg = error.message || error;
      console.error(chalk.red('Failed to start chat:'), msg);
      if (msg.includes('API key')) {
        console.log(chalk.dim('Check your API keys with: dragon config validate'));
      } else if (msg.includes('password') || msg.includes('key')) {
        console.log(chalk.dim('Try: DRAGON_PASSWORD=yourpassword dragon chat'));
      }
      process.exit(1);
    }
  });

// Default action: start REPL
program
  .action(async () => {
    console.log(chalk.cyan(figlet.textSync('Dragon', { font: 'Standard' })));
    console.log(chalk.dim(`Multi-provider AI CLI with Claude API v${VERSION}`));
    console.log();

    try {
      // Check if encrypted config needs password via DRAGON_PASSWORD env var
      const useEncryption = !!process.env.DRAGON_PASSWORD;
      const config = await loadConfig(useEncryption);
      const opts = program.opts();
      await startRepl({ provider: config.defaultProvider, enableMonitoring: opts.monitor });
    } catch (error: any) {
      if (error.code === 'ENOENT' || error.message?.includes('not found')) {
        console.log(chalk.yellow('No configuration found.'));
        console.log(chalk.dim('Run: dragon init'));
        console.log(chalk.dim('Or securely: DRAGON_PASSWORD=yourpass dragon init --encrypt'));
      } else if (error.message?.includes('API key')) {
        console.log(chalk.yellow('Warning: Some API keys are missing or still placeholders.'));
        console.log(chalk.dim('Run: dragon config edit'));
      } else if (error.message?.includes('password') || error.message?.includes('key')) {
        console.log(chalk.yellow('Encrypted config detected. Provide your password to continue:'));
        console.log(chalk.dim('  Option 1 (secure): export DRAGON_PASSWORD=yourpassword'));
        console.log(chalk.dim('  Option 2: dragon init --encrypt --password yourpassword'));
      } else {
        console.error(chalk.red('Error:'), error.message || error);
        console.log(chalk.dim('Run dragon --help for usage information.'));
      }
      process.exit(1);
    }
  });

program.parse();
