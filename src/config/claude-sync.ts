/**
 * Syncs Claude CLI environment variables into Dragon's config at startup.
 * On first run, prompts the user to migrate detected Claude credentials into
 * Dragon's persistent config. After migration (accepted or declined), never
 * prompts again.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import type { DragonConfig } from './loader.js';
import { saveConfig } from './loader.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

const CONFIG_DIR = path.join(process.env.HOME || os.homedir(), '.dragon');
const MIGRATION_MARKER = path.join(CONFIG_DIR, '.claude-migrated');

interface ClaudeEnv {
  baseUrl?: string;
  apiKey?: string;
  models: string[];
  defaultModel?: string;
}

function readClaudeEnv(): ClaudeEnv {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || undefined;
  const apiKey =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    undefined;

  const modelNames: string[] = [];
  const rawModels = [
    process.env.ANTHROPIC_MODEL,
    process.env.ANTHROPIC_SMALL_FAST_MODEL,
    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  ].filter(Boolean) as string[];

  for (const m of rawModels) {
    const cleaned = m.replace(/\[\d+m\]$/g, '');
    if (!modelNames.includes(cleaned)) {
      modelNames.push(cleaned);
    }
  }

  const defaultModel = process.env.ANTHROPIC_MODEL?.replace(/\[\d+m\]$/g, '') || undefined;

  return { baseUrl, apiKey, models: modelNames, defaultModel };
}

function hasClaudeMigrationDone(): boolean {
  return fs.existsSync(MIGRATION_MARKER);
}

function markClaudeMigrationDone(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(MIGRATION_MARKER, '');
}

function syncFromClaudeEnv(config: DragonConfig): void {
  const env = readClaudeEnv();

  if (!env.baseUrl && !env.apiKey && env.models.length === 0) {
    return;
  }

  logger.debug('Syncing from Claude environment variables');

  if (!config.providers.anthropic) {
    config.providers.anthropic = {};
  }

  const anthro = config.providers.anthropic;

  if (env.baseUrl) {
    anthro.baseUrl = env.baseUrl;
    logger.debug(`  baseUrl: ${env.baseUrl}`);
  }

  if (env.apiKey) {
    anthro.apiKey = env.apiKey;
    logger.debug('  apiKey: synced from Claude env');
  }

  if (env.defaultModel) {
    anthro.defaultModel = env.defaultModel;
    logger.debug(`  defaultModel: ${env.defaultModel}`);
  }

  if (env.models.length > 0) {
    anthro.models = env.models;
    logger.debug(`  models: ${env.models.join(', ')}`);
  }
}

/**
 * Prompts the user to migrate detected Claude env vars into Dragon's config.
 * Only runs once — after the first run, the migration marker prevents re-prompting.
 */
function promptMigration(env: ClaudeEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const details: string[] = [];
    if (env.apiKey) details.push(chalk.dim(`  API Key:     ${env.apiKey.substring(0, 12)}...`));
    if (env.baseUrl) details.push(chalk.dim(`  Base URL:    ${env.baseUrl}`));
    if (env.defaultModel) details.push(chalk.dim(`  Model:       ${env.defaultModel}`));
    if (env.models.length > 0) details.push(chalk.dim(`  All Models:  ${env.models.join(', ')}`));

    process.stdout.write(
      chalk.cyan('\n  Claude configuration detected from environment:\n') +
      details.join('\n') + '\n\n' +
      chalk.cyan('  Migrate to Dragon config?') + chalk.dim(' (saves to ~/.dragon/config.json)\n') +
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
 * On first run: detects Claude CLI env vars, prompts user to migrate them into
 * Dragon's persistent config. On subsequent runs, does nothing (marker file exists).
 *
 * In all cases where env vars are detected on first run, the in-memory config is
 * updated so the current session can use them regardless of the user's choice.
 */
export async function detectAndMigrateClaudeEnv(
  config: DragonConfig,
  useEncryption: boolean = false,
): Promise<void> {
  // Only run once — never prompt again after first detection
  if (hasClaudeMigrationDone()) {
    return;
  }

  const env = readClaudeEnv();

  // Nothing to migrate — mark done and move on
  if (!env.apiKey && !env.baseUrl && env.models.length === 0) {
    markClaudeMigrationDone();
    return;
  }

  // Found Claude env vars — prompt user
  const shouldMigrate = await promptMigration(env);

  if (shouldMigrate) {
    // Apply to in-memory config
    syncFromClaudeEnv(config);

    // Persist to disk
    try {
      saveConfig(config, useEncryption);
      logger.info('Claude configuration migrated to Dragon config');
      console.log(chalk.green('  Configuration saved to ~/.dragon/config.json\n'));
    } catch (err: any) {
      logger.error('Failed to save migrated config', err);
      console.log(chalk.red(`  Failed to save: ${err.message}\n`));
    }
  } else {
    // User declined — still apply to in-memory config for this session
    syncFromClaudeEnv(config);
    console.log(chalk.dim('  Skipped. You can set up providers later with: dragon config edit\n'));
  }

  markClaudeMigrationDone();
}
