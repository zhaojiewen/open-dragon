import fs from 'fs';
import path from 'path';
import { DragonConfig, DragonConfigSchema, DEFAULT_CONFIG } from './schema.js';
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

    throw new ConfigInvalidError(
      `Failed to load config file: ${CONFIG_FILE}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

export async function initConfig(
  force: boolean = false,
  useEncryption: boolean = false
): Promise<void> {
  logger.debug(`Initializing config at ${CONFIG_FILE}`);

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    logger.debug(`Created config directory: ${CONFIG_DIR}`);
  }

  if (fs.existsSync(CONFIG_FILE) && !force) {
    logger.warn(`Configuration already exists at ${CONFIG_FILE}`);
    console.log('Use --force to overwrite.');
    return;
  }

  const templateConfig = {
    ...DEFAULT_CONFIG,
    providers: {
      openai: { ...DEFAULT_CONFIG.providers.openai, apiKey: 'YOUR_OPENAI_API_KEY' },
      anthropic: { ...DEFAULT_CONFIG.providers.anthropic, apiKey: 'YOUR_ANTHROPIC_API_KEY' },
      gemini: { ...DEFAULT_CONFIG.providers.gemini, apiKey: 'YOUR_GEMINI_API_KEY' },
      deepseek: { ...DEFAULT_CONFIG.providers.deepseek, apiKey: 'YOUR_DEEPSEEK_API_KEY' },
      qwen: { ...DEFAULT_CONFIG.providers.qwen, apiKey: 'YOUR_QWEN_API_KEY' },
    },
  };

  let configToSave = templateConfig as any;

  if (useEncryption && encryptionService.isInitialized()) {
    logger.debug('Encrypting sensitive config fields');
    configToSave = secureConfigManager.encryptConfig(templateConfig);
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  logger.info(`Configuration file created at ${CONFIG_FILE}`);
  console.log(`Configuration file created at ${CONFIG_FILE}`);
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

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  logger.debug('Configuration saved successfully');
}

export { DragonConfig, DEFAULT_CONFIG };
