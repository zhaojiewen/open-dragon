import fs from 'fs';
import path from 'path';
import { DragonConfig, DragonConfigSchema, DEFAULT_CONFIG } from './schema.js';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.dragon');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<DragonConfig> {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Configuration file not found at ${CONFIG_FILE}. Run 'dragon init' to create one.`);
  }

  const rawConfig = fs.readFileSync(CONFIG_FILE, 'utf-8');
  const parsedConfig = JSON.parse(rawConfig);

  const config = DragonConfigSchema.parse({
    ...DEFAULT_CONFIG,
    ...parsedConfig,
    providers: {
      ...DEFAULT_CONFIG.providers,
      ...parsedConfig.providers,
    },
    tools: {
      ...DEFAULT_CONFIG.tools,
      ...parsedConfig.tools,
    },
  });

  return config;
}

export async function initConfig(force: boolean = false): Promise<void> {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (fs.existsSync(CONFIG_FILE) && !force) {
    console.log(`Configuration already exists at ${CONFIG_FILE}`);
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

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(templateConfig, null, 2));
  console.log(`Configuration file created at ${CONFIG_FILE}`);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function saveConfig(config: DragonConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export { DragonConfig, DEFAULT_CONFIG };
