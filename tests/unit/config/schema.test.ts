import { describe, it, expect } from 'vitest';
import {
  ProviderConfigSchema,
  BashToolConfigSchema,
  ToolsConfigSchema,
  LogConfigSchema,
  DragonConfigSchema,
  DEFAULT_CONFIG,
} from '../../../src/config/schema.js';

describe('ProviderConfigSchema', () => {
  it('should validate empty object', () => {
    const result = ProviderConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it('should validate full config', () => {
    const config = {
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      models: ['model-1', 'model-2'],
      defaultModel: 'model-1',
    };
    const result = ProviderConfigSchema.parse(config);
    expect(result).toEqual(config);
  });

  it('should validate partial config', () => {
    const config = {
      apiKey: 'test-key',
      models: ['model-1'],
    };
    const result = ProviderConfigSchema.parse(config);
    expect(result).toEqual(config);
  });

  it('should reject invalid models type', () => {
    expect(() =>
      ProviderConfigSchema.parse({ models: 'not-an-array' })
    ).toThrow();
  });
});

describe('BashToolConfigSchema', () => {
  it('should use default value', () => {
    const result = BashToolConfigSchema.parse({});
    expect(result.dangerouslyDisableSandbox).toBe(false);
  });

  it('should accept true value', () => {
    const result = BashToolConfigSchema.parse({ dangerouslyDisableSandbox: true });
    expect(result.dangerouslyDisableSandbox).toBe(true);
  });

  it('should accept false value', () => {
    const result = BashToolConfigSchema.parse({ dangerouslyDisableSandbox: false });
    expect(result.dangerouslyDisableSandbox).toBe(false);
  });

  it('should reject non-boolean value', () => {
    expect(() =>
      BashToolConfigSchema.parse({ dangerouslyDisableSandbox: 'yes' })
    ).toThrow();
  });
});

describe('ToolsConfigSchema', () => {
  it('should use default enabled tools', () => {
    const result = ToolsConfigSchema.parse({});
    expect(result.enabled).toContain('bash');
    expect(result.enabled).toContain('read');
  });

  it('should accept custom enabled tools', () => {
    const result = ToolsConfigSchema.parse({ enabled: ['bash', 'read'] });
    expect(result.enabled).toEqual(['bash', 'read']);
  });

  it('should accept bash config', () => {
    const result = ToolsConfigSchema.parse({
      bash: { dangerouslyDisableSandbox: true },
    });
    expect(result.bash?.dangerouslyDisableSandbox).toBe(true);
  });
});

describe('LogConfigSchema', () => {
  it('should use default values', () => {
    const result = LogConfigSchema.parse({});
    expect(result.level).toBe('info');
    expect(result.enableConsole).toBe(true);
    expect(result.logFile).toBeUndefined();
  });

  it('should accept valid log levels', () => {
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    for (const level of levels) {
      const result = LogConfigSchema.parse({ level });
      expect(result.level).toBe(level);
    }
  });

  it('should reject invalid log level', () => {
    expect(() => LogConfigSchema.parse({ level: 'invalid' })).toThrow();
  });

  it('should accept logFile', () => {
    const result = LogConfigSchema.parse({ logFile: '/var/log/dragon.log' });
    expect(result.logFile).toBe('/var/log/dragon.log');
  });
});

describe('DragonConfigSchema', () => {
  it('should use default values', () => {
    const result = DragonConfigSchema.parse({});
    expect(result.defaultProvider).toBe('anthropic');
    expect(result.providers).toEqual({});
  });

  it('should accept full config', () => {
    const config = {
      defaultProvider: 'openai',
      providers: {
        openai: {
          apiKey: 'sk-test',
          models: ['gpt-4'],
          defaultModel: 'gpt-4',
        },
      },
      tools: {
        enabled: ['bash'],
      },
      logging: {
        level: 'debug',
      },
    };
    const result = DragonConfigSchema.parse(config);
    expect(result.defaultProvider).toBe('openai');
    expect(result.providers?.openai?.apiKey).toBe('sk-test');
  });

  it('should accept multiple providers', () => {
    const config = {
      providers: {
        openai: { apiKey: 'sk-openai' },
        anthropic: { apiKey: 'sk-anthropic' },
        gemini: { apiKey: 'sk-gemini' },
      },
    };
    const result = DragonConfigSchema.parse(config);
    expect(Object.keys(result.providers || {})).toHaveLength(3);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have default provider', () => {
    expect(DEFAULT_CONFIG.defaultProvider).toBe('anthropic');
  });

  it('should have multiple provider configs', () => {
    const providers = Object.keys(DEFAULT_CONFIG.providers || {});
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('gemini');
    expect(providers).toContain('deepseek');
    expect(providers).toContain('qwen');
  });

  it('should have enabled tools', () => {
    expect(DEFAULT_CONFIG.tools?.enabled).toBeDefined();
    expect(DEFAULT_CONFIG.tools?.enabled?.length).toBeGreaterThan(0);
  });

  it('should have logging config', () => {
    expect(DEFAULT_CONFIG.logging?.level).toBe('info');
    expect(DEFAULT_CONFIG.logging?.enableConsole).toBe(true);
  });

  it('should have valid provider configs', () => {
    for (const [name, config] of Object.entries(DEFAULT_CONFIG.providers || {})) {
      expect(config.models).toBeDefined();
      expect(config.models?.length).toBeGreaterThan(0);
      expect(config.defaultModel).toBeDefined();
    }
  });
});
