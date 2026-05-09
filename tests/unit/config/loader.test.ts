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

    it('should initialize security logging when logFile is configured', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const mockSetLogFile = vi.fn();
      const mockSetSecurityLogFile = vi.fn();
      const mockSecurity = vi.fn();

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
          setLogFile: mockSetLogFile,
          setSecurityLogFile: mockSetSecurityLogFile,
          security: mockSecurity,
        }),
      }));

      vi.resetModules();

      const configWithLogging = {
        defaultProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'sk-test-key',
          },
        },
        logging: {
          logFile: '/var/log/dragon/app.log',
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(configWithLogging));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await loadConfig();

      expect(mockSetLogFile).toHaveBeenCalledWith('/var/log/dragon/app.log');
      expect(mockSetSecurityLogFile).toHaveBeenCalledWith('/var/log/dragon/security.log');
      expect(mockSecurity).toHaveBeenCalledWith('config_loaded', expect.objectContaining({
        providers: expect.arrayContaining(['openai'])
      }));
    });

    it('should re-throw ConfigInvalidError as is', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      // Create a config that passes JSON parse but fails schema validation
      const invalidConfig = {
        defaultProvider: 'nonexistent',
        providers: {
          openai: {
            apiKey: 'sk-test-key',
          },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(invalidConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await expect(loadConfig()).rejects.toThrow();
    });

    it('should handle error with Error instance message', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      // Create config that will fail Zod validation
      const invalidConfig = {
        defaultProvider: { nested: 'object' }, // Should be string
        providers: {},
      };

      fs.writeFileSync(configFile, JSON.stringify(invalidConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await expect(loadConfig()).rejects.toThrow();
    });

    it('should handle valid JSON config', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      // Write valid JSON that loads successfully
      fs.writeFileSync(configFile, '{"providers": {"openai": {"apiKey": "test"}}}');

      const { loadConfig } = await import('../../../src/config/loader.js');
      const config = await loadConfig();
      expect(config).toBeDefined();
    });

    it('should throw ConfigInvalidError with details for SyntaxError', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, '{invalid json}');

      const { loadConfig } = await import('../../../src/config/loader.js');
      try {
        await loadConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Invalid JSON');
        expect(error.code).toBe(1002); // CONFIG_INVALID ErrorCode
      }
    });

    it('should not decrypt when useEncryption is false', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const decryptMock = vi.fn((config) => config);

      vi.doMock('../../../src/encryption/index.js', () => ({
        encryptionService: {
          isInitialized: vi.fn(() => true),
        },
        secureConfigManager: {
          encryptConfig: vi.fn((config) => config),
          decryptConfig: decryptMock,
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
          openai: { apiKey: 'test-key' },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(testConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await loadConfig(false);

      // decryptConfig should not be called when useEncryption is false
      expect(decryptMock).not.toHaveBeenCalled();
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

    it('should not encrypt when encryption service is not initialized', async () => {
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

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true, true);

      const content = fs.readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(content);
      // Should have placeholder keys since encryption was not applied
      expect(parsed.providers.openai.apiKey).toBe('YOUR_OPENAI_API_KEY');
    });

    it('should set correct file permissions', async () => {
      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);

      const stats = fs.statSync(configFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should set correct directory permissions', async () => {
      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);

      const stats = fs.statSync(configDir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
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

    it('should create config directory if not exists', async () => {
      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      // Ensure directory doesn't exist
      expect(fs.existsSync(configDir)).toBe(false);

      saveConfig(DEFAULT_CONFIG);

      expect(fs.existsSync(configDir)).toBe(true);
      expect(fs.existsSync(configFile)).toBe(true);
    });

    it('should set correct file permissions', async () => {
      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      saveConfig(DEFAULT_CONFIG);

      const stats = fs.statSync(configFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should create directory with correct permissions', async () => {
      const { saveConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      saveConfig(DEFAULT_CONFIG);

      const stats = fs.statSync(configDir);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });

  describe('validateConfig', () => {
    it('should return valid for correct config', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for default provider not in providers', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'anthropic', // Not in providers
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Default provider 'anthropic' is not configured in providers");
    });

    it('should return error for missing API key', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
          anthropic: { apiKey: undefined }, // Missing API key
        },
        defaultProvider: 'openai',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider 'anthropic' is missing API key");
    });

    it('should return error for placeholder API key', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'YOUR_OPENAI_API_KEY' },
        },
        defaultProvider: 'openai',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider 'openai' has placeholder API key that needs to be replaced");
    });

    it('should return error for unknown tool in enabled tools', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
        tools: {
          enabled: ['bash', 'unknown-tool'],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Unknown tool 'unknown-tool' in enabled tools list");
    });

    it('should allow MCP tools with mcp: prefix', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
        tools: {
          enabled: ['bash', 'mcp:custom-tool', 'mcp:another-tool'],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple validation errors', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'YOUR_OPENAI_API_KEY' }, // Placeholder
          anthropic: {}, // Missing API key
        },
        defaultProvider: 'gemini', // Not in providers
        tools: {
          enabled: ['unknown-tool'],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain("Default provider 'gemini' is not configured in providers");
      expect(result.errors).toContain("Provider 'openai' has placeholder API key that needs to be replaced");
      expect(result.errors).toContain("Provider 'anthropic' is missing API key");
      expect(result.errors).toContain("Unknown tool 'unknown-tool' in enabled tools list");
    });

    it('should return no errors for empty tools.enabled', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
        tools: {
          enabled: [],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should handle config without tools config', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
        tools: undefined,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should validate all known tools', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
        },
        defaultProvider: 'openai',
        tools: {
          enabled: ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'webfetch', 'websearch', 'agent', 'skill'],
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should handle provider with empty object (missing apiKey)', async () => {
      const { validateConfig } = await import('../../../src/config/loader.js');
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      const config = {
        ...DEFAULT_CONFIG,
        providers: {
          openai: { apiKey: 'sk-test-key' },
          emptyProvider: {}, // Missing apiKey
        },
        defaultProvider: 'openai',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider 'emptyProvider' is missing API key");
    });
  });

  describe('DEFAULT_CONFIG structure', () => {
    it('should have all expected provider configurations', async () => {
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');

      expect(DEFAULT_CONFIG.providers).toHaveProperty('openai');
      expect(DEFAULT_CONFIG.providers).toHaveProperty('anthropic');
      expect(DEFAULT_CONFIG.providers).toHaveProperty('gemini');
      expect(DEFAULT_CONFIG.providers).toHaveProperty('deepseek');
      expect(DEFAULT_CONFIG.providers).toHaveProperty('qwen');
    });

    it('should have default provider set to anthropic', async () => {
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');
      expect(DEFAULT_CONFIG.defaultProvider).toBe('anthropic');
    });

    it('should have enabled tools', async () => {
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');
      expect(DEFAULT_CONFIG.tools?.enabled).toContain('bash');
      expect(DEFAULT_CONFIG.tools?.enabled).toContain('read');
      expect(DEFAULT_CONFIG.tools?.enabled).toContain('write');
      expect(DEFAULT_CONFIG.tools?.enabled).toContain('edit');
    });

    it('should have correct qwen base URL', async () => {
      const { DEFAULT_CONFIG } = await import('../../../src/config/schema.js');
      expect(DEFAULT_CONFIG.providers.qwen.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });
  });

  describe('Config file path handling', () => {
    it('should use HOME environment variable for config path', async () => {
      // Set a custom HOME
      const customHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dragon-custom-home-'));
      process.env.HOME = customHome;

      vi.resetModules();

      const { getConfigPath } = await import('../../../src/config/loader.js');
      const configPath = getConfigPath();

      expect(configPath).toBe(path.join(customHome, '.dragon', 'config.json'));

      // Cleanup
      fs.rmSync(customHome, { recursive: true, force: true });
    });

    it('should fallback to os.homedir() when HOME is not set', async () => {
      const originalHome = process.env.HOME;
      delete process.env.HOME;

      vi.resetModules();

      const { getConfigPath } = await import('../../../src/config/loader.js');
      const configPath = getConfigPath();

      expect(configPath).toBe(path.join(os.homedir(), '.dragon', 'config.json'));

      // Restore
      process.env.HOME = originalHome;
    });
  });

  describe('Error handling', () => {
    it('should throw ConfigNotFoundError with correct path', async () => {
      const { loadConfig } = await import('../../../src/config/loader.js');

      try {
        await loadConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Configuration file not found');
        expect(error.details?.configPath).toBe(configFile);
      }
    });

    it('should throw ConfigInvalidError for JSON syntax errors', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, '{invalid json');

      const { loadConfig } = await import('../../../src/config/loader.js');

      try {
        await loadConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Invalid JSON');
      }
    });

    it('should include original error message in ConfigInvalidError', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      // This will fail Zod validation
      fs.writeFileSync(configFile, JSON.stringify({
        defaultProvider: 123, // Should be string
        providers: {},
      }));

      const { loadConfig } = await import('../../../src/config/loader.js');

      try {
        await loadConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Failed to load config file');
      }
    });
  });

  describe('Encryption edge cases', () => {
    it('should handle encryption disabled when useEncryption is true but service not initialized', async () => {
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

      const testConfig = {
        providers: {
          openai: { apiKey: 'test-key' },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(testConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      const config = await loadConfig(true);

      expect(config).toBeDefined();
      expect(config.providers.openai.apiKey).toBe('test-key');
    });
  });

  describe('Logging behavior', () => {
    it('should log debug messages during config load', async () => {
      fs.mkdirSync(configDir, { recursive: true });

      const mockDebug = vi.fn();

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
          debug: mockDebug,
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const testConfig = {
        providers: {
          openai: { apiKey: 'test-key' },
        },
      };

      fs.writeFileSync(configFile, JSON.stringify(testConfig));

      const { loadConfig } = await import('../../../src/config/loader.js');
      await loadConfig();

      expect(mockDebug).toHaveBeenCalled();
    });

    it('should log info message after config init', async () => {
      const mockInfo = vi.fn();

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
          info: mockInfo,
          warn: vi.fn(),
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(true);

      expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Configuration file created'));
    });

    it('should log warning when config already exists', async () => {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, '{}');

      const mockWarn = vi.fn();

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
          warn: mockWarn,
          error: vi.fn(),
        }),
      }));

      vi.resetModules();

      const { initConfig } = await import('../../../src/config/loader.js');
      await initConfig(false);

      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('already exists'));
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