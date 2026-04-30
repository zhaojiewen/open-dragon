import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { DragonConfigSchema, DEFAULT_CONFIG } from './schema.js';
import type { DragonConfig } from './schema.js';
import { ConfigNotFoundError, ConfigInvalidError } from '../utils/errors.js';
import { secureConfigManager, encryptionService } from '../encryption/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();
const CONFIG_DIR = path.join(process.env.HOME || '~', '.dragon');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(useEncryption: boolean = false): Promise<DragonConfig> {
  logger.debug(`Loading config from ${CONFIG_FILE}`);

  if (!fs.existsSync(CONFIG_FILE)) {
    throw new ConfigNotFoundError(CONFIG_FILE);
  }

  try {
    const rawConfig = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsedConfig = JSON.parse(rawConfig);

    // Decrypt sensitive fields if encryption is enabled
    let decryptedConfig = parsedConfig;
    if (useEncryption && encryptionService.isInitialized()) {
      logger.debug('Decrypting sensitive config fields');
      decryptedConfig = secureConfigManager.decryptConfig(parsedConfig);
    }

    const config = DragonConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...decryptedConfig,
      providers: {
        ...DEFAULT_CONFIG.providers,
        ...decryptedConfig.providers,
      },
      tools: {
        ...DEFAULT_CONFIG.tools,
        ...decryptedConfig.tools,
      },
    });

    logger.info('Configuration loaded successfully');

    // Initialize security logging if configured
    if (config.logging?.logFile) {
      const securityLogFile = path.join(path.dirname(config.logging.logFile), 'security.log');
      logger.setLogFile(config.logging.logFile);
      logger.setSecurityLogFile(securityLogFile);
      logger.security('config_loaded', { providers: Object.keys(config.providers) });
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigInvalidError(
        `Invalid JSON in config file: ${CONFIG_FILE}`,
        { error: error.message }
      );
    }

    if (error instanceof ConfigInvalidError) {
      throw error;
    }

    // Include the original validation error message for debugging
    const originalMsg = error instanceof Error ? error.message : String(error);
    throw new ConfigInvalidError(
      `Failed to load config file: ${CONFIG_FILE} - ${originalMsg}`,
      { error: originalMsg }
    );
  }
}

export async function initConfig(
  force: boolean = false,
  useEncryption: boolean = false
): Promise<void> {
  logger.debug(`Initializing config at ${CONFIG_FILE}`);

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    logger.debug(`Created config directory: ${CONFIG_DIR}`);
  }

  if (fs.existsSync(CONFIG_FILE) && !force) {
    logger.warn(`Configuration already exists at ${CONFIG_FILE}`);
    console.log('Use --force to overwrite.');
    return;
  }

  const cwd = process.cwd();
  const templateConfig = {
    ...DEFAULT_CONFIG,
    providers: {
      openai: { ...DEFAULT_CONFIG.providers.openai, apiKey: 'YOUR_OPENAI_API_KEY' },
      anthropic: { ...DEFAULT_CONFIG.providers.anthropic, apiKey: 'YOUR_ANTHROPIC_API_KEY' },
      gemini: { ...DEFAULT_CONFIG.providers.gemini, apiKey: 'YOUR_GEMINI_API_KEY' },
      deepseek: { ...DEFAULT_CONFIG.providers.deepseek, apiKey: 'YOUR_DEEPSEEK_API_KEY' },
      qwen: { ...DEFAULT_CONFIG.providers.qwen, apiKey: 'YOUR_QWEN_API_KEY' },
    },
    workspace: {
      paths: [cwd],
      writeEnabled: true,
      enforceBounds: true,
      allowHomeDir: true,
    },
  };

  let configToSave = templateConfig as any;

  if (useEncryption && encryptionService.isInitialized()) {
    logger.debug('Encrypting sensitive config fields');
    configToSave = secureConfigManager.encryptConfig(templateConfig);
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  fs.chmodSync(CONFIG_FILE, 0o600);
  logger.info(`Configuration file created at ${CONFIG_FILE}`);
  console.log(`Configuration file created at ${CONFIG_FILE}`);
  console.log(chalk.dim ? chalk.dim(`Workspace: ${cwd}`) : `Workspace: ${cwd}`);
  console.log(chalk.dim ? chalk.dim('Edit workspace paths in ~/.dragon/config.json → workspace.paths') : 'Edit workspace paths in ~/.dragon/config.json → workspace.paths');
}

function ensureConfigDirectory(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function validateConfig(config: DragonConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if default provider exists
  if (!config.providers[config.defaultProvider]) {
    errors.push(`Default provider '${config.defaultProvider}' is not configured in providers`);
  }

  // Check each provider has valid API key
  for (const [name, provider] of Object.entries(config.providers)) {
    if (!provider.apiKey) {
      errors.push(`Provider '${name}' is missing API key`);
    } else if (provider.apiKey.startsWith('YOUR_')) {
      errors.push(`Provider '${name}' has placeholder API key that needs to be replaced`);
    }
  }

  // Check tool configurations
  if (config.tools?.enabled) {
    const availableTools = ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'agent'];
    for (const tool of config.tools.enabled) {
      if (!availableTools.includes(tool)) {
        errors.push(`Unknown tool '${tool}' in enabled tools list`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function saveConfig(config: DragonConfig, useEncryption: boolean = false): void {
  let configToSave = config as any;

  if (useEncryption && encryptionService.isInitialized()) {
    logger.debug('Encrypting sensitive config fields before save');
    configToSave = secureConfigManager.encryptConfig(config);
  }

  ensureConfigDirectory();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  fs.chmodSync(CONFIG_FILE, 0o600);
  logger.debug('Configuration saved successfully');
}

export type { DragonConfig };
export { DEFAULT_CONFIG };
