#!/usr/bin/env node

import { program } from 'commander';
import { startRepl } from './repl.js';
import { loadConfig, initConfig } from './config/index.js';
import { encryptionService } from './encryption/index.js';
import { getLogger, LogLevel } from './utils/logger.js';
import chalk from 'chalk';
import figlet from 'figlet';

const VERSION = '1.0.0';
const logger = getLogger();

// Handle environment variables
if (process.env.DRAGON_DEBUG === 'true') {
  logger.setLevel(LogLevel.DEBUG);
  logger.debug('Debug mode enabled');
}

program
  .name('dragon')
  .description('Multi-provider AI CLI tool - your intelligent coding companion')
  .version(VERSION);

program
  .command('init')
  .description('Initialize configuration file')
  .option('-f, --force', 'Force overwrite existing config')
  .option('-e, --encrypt', 'Encrypt sensitive fields in config')
  .option('-p, --password <password>', 'Password for encryption (optional)')
  .action(async (options) => {
    try {
      // Initialize encryption if requested
      if (options.encrypt) {
        await encryptionService.initialize(options.password);
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
  .command('config')
  .description('Open configuration file in editor')
  .action(() => {
    const configPath = process.env.HOME + '/.dragon/config.json';
    console.log(chalk.dim(`Config file: ${configPath}`));
    console.log(chalk.yellow('Please edit the file manually to add your API keys'));
  });

program
  .command('chat')
  .description('Start interactive chat session')
  .option('-p, --provider <provider>', 'AI provider to use')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const provider = options.provider || config.defaultProvider;
      await startRepl({ provider, model: options.model });
    } catch (error) {
      console.error(chalk.red('Failed to start chat:'), error);
      process.exit(1);
    }
  });

// Default action: start REPL
program
  .action(async () => {
    console.log(chalk.cyan(figlet.textSync('Dragon', { font: 'Standard' })));
    console.log(chalk.dim(`Multi-provider AI CLI v${VERSION}`));
    console.log();

    try {
      const config = await loadConfig();
      await startRepl({ provider: config.defaultProvider });
    } catch (error: any) {
      if (error.code === 'ENOENT' || error.message?.includes('not found')) {
        console.log(chalk.yellow('No configuration found. Run `dragon init` first.'));
        process.exit(1);
      }
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program.parse();
