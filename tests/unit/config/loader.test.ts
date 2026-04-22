import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config Loader', () => {
  let tempDir: string;
  let configDir: string;
  let configFile: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dragon-config-test-'));
    configDir = path.join(tempDir, '.dragon');
    configFile = path.join(configDir, 'config.json');
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  describe('getConfigPath', () => {
    it('should return config file path', async () => {
      const { getConfigPath } = await import('../../../src/config/loader.js');
      const configPath = getConfigPath();
      expect(configPath).toBe(configFile);
    });
  });

  describe('loadConfig', () => {
    it('should throw ConfigNotFoundError when config file does not exist', async () => {
      const { loadConfig } = await import('../../../src/config/loader.js');
      await expect(loadConfig()).rejects.toThrow('Configuration file not found');
    });

    it('should load valid config file', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const validConfig = {
        defaultProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'sk-test-key',
            models: ['gpt-4o'],
            defaultModel: 'gpt-4o',
          },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(validConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      const config = await loadConfig();
      expect(config.defaultProvider).toBe('openai');
      expect(config.providers.openai.apiKey).toBe('sk-test-key');
    });

    it('should merge with default config', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const partialConfig = {
        providers: {
          openai: {
            apiKey: 'sk-test',
          },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(partialConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      const config = await loadConfig();
      expect(config.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    });

    it('should throw ConfigInvalidError for invalid JSON', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, 'invalid json content');

      const { loadConfig } = await import('../../../src/config/loader.js');
      await expect(loadConfig()).rejects.toThrow();
    });

    it('should throw ConfigInvalidError for schema validation errors', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const invalidConfig = {
        defaultProvider: 123,
        providers: {},
      };

      fs.writeFileSync(configFile, JSON.stringify(invalidConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await expect(loadConfig()).rejects.toThrow();
    });

    it('should handle encryption when useEncryption is true', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      vi.doMock('../../../src/encryption/index.js', () => ({
        encryptionService: {
          isInitialized: vi.fn(() => true),
        },
        secureConfigManager: {
          encryptConfig: vi.fn((config) => config),
          decryptConfig: vi.fn((config) => config),
        },
      }));

      vi.doMock('../../../src/utils/logger.js', () => ({
        getLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const testConfig = {
        providers: {
          openai: { apiKey: 'encrypted-key' },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(testConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      const config = await loadConfig(true);
      expect(config).toBeDefined();
    });
  });

  describe('initConfig', () => {
    it('should create config directory if not exists', async () => {
      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);
      expect(fs.existsSync(configDir)).toBe(true);
    });

    it('should create config file', async () => {
      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);
      expect(fs.existsSync(configFile)).toBe(true);
    });

    it('should not overwrite existing config without force', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      const existingContent = '{"existing": "config"}';
      fs.writeFileSync(configFile, existingContent);

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(false);

      const content = fs.readFileSync(configFile, 'utf-8');
      expect(content).toBe(existingContent);
    });

    it('should overwrite existing config with force', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, '{"existing": "config"}');

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);

      const content = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.defaultProvider).toBeDefined();
    });

    it('should include placeholder API keys', async () => {
      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);

      const content = fs.readFileSync(configFile, 'utf-8');
      expect(content).toContain('YOUR_OPENAI_API_KEY');
      expect(content).toContain('YOUR_ANTHROPIC_API_KEY');
    });

    it('should encrypt sensitive fields when useEncryption is true and initialized', async () => {
      vi.doMock('../../../src/encryption/index.js', () => ({
        encryptionService: {
          isInitialized: vi.fn(() => true),
        },
        secureConfigManager: {
          encryptConfig: vi.fn((cfg: any) => ({
            ...cfg,
            encrypted: true,
          })),
          decryptConfig: vi.fn((config) => config),
        },
      }));

      vi.doMock('../../../src/utils/logger.js', () => ({
        getLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true, true);

      const content = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.encrypted).toBe(true);
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      // Create config directory first
      fs.mkdirSync(configDir, { recursive: true });

      const config = {
        ...DEFAULT_CONFIG,
        defaultProvider: 'test-provider',
      };

      saveConfig(config);

      expect(fs.existsSync(configFile)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      expect(saved.defaultProvider).toBe('test-provider');
    });

    it('should encrypt when useEncryption is true and initialized', async () => {
      // Create config directory first
      fs.mkdirSync(configDir, { recursive: true });

      vi.doMock('../../../src/encryption/index.js', () => ({
        encryptionService: {
          isInitialized: vi.fn(() => true),
        },
        secureConfigManager: {
          encryptConfig: vi.fn((cfg: any) => ({
            ...cfg,
            encrypted: true,
          })),
          decryptConfig: vi.fn((config) => config),
        },
      }));

      vi.doMock('../../../src/utils/logger.js', () => ({
        getLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      saveConfig(DEFAULT_CONFIG, true);

      const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      expect(saved.encrypted).toBe(true);
    });

    it('should not encrypt when useEncryption is false', async () => {
      // Create config directory first
      fs.mkdirSync(configDir, { recursive: true });

      vi.doMock('../../../src/encryption/index.js', () => ({
        encryptionService: {
          isInitialized: vi.fn(() => false),
        },
        secureConfigManager: {
          encryptConfig: vi.fn((config) => config),
          decryptConfig: vi.fn((config) => config),
        },
      }));

      vi.doMock('../../../src/utils/logger.js', () => ({
        getLogger: () => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      saveConfig(DEFAULT_CONFIG, false);

      const saved = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      expect(saved.encrypted).toBeUndefined();
    });
  });
});

describe('Config Integration', () => {
  it('should validate config loaded from file', async () => {
    const { DragonConfigSchema, DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

    const rawConfig = {
      defaultProvider: 'openai',
      providers: {
        openai: {
          apiKey: 'sk-test-key',
          models: ['gpt-4o'],
          defaultModel: 'gpt-4o',
        },
      },
    };

    const mergedConfig = DragonConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...rawConfig,
      providers: {
        ...DEFAULT_CONFIG.providers,
        ...rawConfig.providers,
      },
    });

    expect(mergedConfig.defaultProvider).toBe('openai');
    expect(mergedConfig.providers?.openai?.apiKey).toBe('sk-test-key');
  });

  it('should merge with default config correctly', async () => {
    const { DragonConfigSchema, DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

    const rawConfig = {
      providers: {
        custom: {
          apiKey: 'custom-key',
          models: ['custom-model'],
          defaultModel: 'custom-model',
        },
      },
    };

    const mergedConfig = DragonConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...rawConfig,
      providers: {
        ...DEFAULT_CONFIG.providers,
        ...rawConfig.providers,
      },
    });

    expect(mergedConfig.providers?.openai).toBeDefined();
    expect(mergedConfig.providers?.anthropic).toBeDefined();
    expect(mergedConfig.providers?.custom?.apiKey).toBe('custom-key');
    expect(mergedConfig.defaultProvider).toBe('anthropic');
  });
});
