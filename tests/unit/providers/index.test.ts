import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProvider, listSupportedProviders } from '../../../src/providers/index.js';
import { DragonConfig } from '../../../src/config/schema.js';

// Mock all providers
vi.mock('../../../src/providers/openai.js', () => ({
  OpenAIProvider: class MockOpenAIProvider {
    name = 'openai';
    chat = vi.fn();
    stream = vi.fn();
    listModels = vi.fn();
    getDefaultModel = vi.fn();
  },
}));

vi.mock('../../../src/providers/anthropic.js', () => ({
  AnthropicProvider: class MockAnthropicProvider {
    name = 'anthropic';
    chat = vi.fn();
    stream = vi.fn();
    listModels = vi.fn();
    getDefaultModel = vi.fn();
  },
}));

vi.mock('../../../src/providers/gemini.js', () => ({
  GeminiProvider: class MockGeminiProvider {
    name = 'gemini';
    chat = vi.fn();
    stream = vi.fn();
    listModels = vi.fn();
    getDefaultModel = vi.fn();
  },
}));

vi.mock('../../../src/providers/deepseek.js', () => ({
  DeepSeekProvider: class MockDeepSeekProvider {
    name = 'deepseek';
    chat = vi.fn();
    stream = vi.fn();
    listModels = vi.fn();
    getDefaultModel = vi.fn();
  },
}));

vi.mock('../../../src/providers/chinese.js', () => ({
  ChineseProvider: class MockChineseProvider {
    name: string;
    constructor(config: { name: string }) {
      this.name = config.name;
    }
    chat = vi.fn();
    stream = vi.fn();
    listModels = vi.fn();
    getDefaultModel = vi.fn();
  },
  CHINESE_PROVIDERS: {
    qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    moonshot: { baseUrl: 'https://api.moonshot.cn/v1' },
    yi: { baseUrl: 'https://api.lingyiwanwu.com/v1' },
    doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  },
}));

describe('Provider Factory', () => {
  const createMockConfig = (providerName: string, apiKey: string, baseUrl?: string): DragonConfig => ({
    defaultProvider: providerName,
    providers: {
      [providerName]: {
        apiKey,
        models: ['model-1'],
        defaultModel: 'model-1',
        baseUrl,
      },
    },
  });

  describe('createProvider', () => {
    it('should create OpenAI provider', () => {
      const config = createMockConfig('openai', 'sk-test');
      const provider = createProvider('openai', config);
      expect(provider.name).toBe('openai');
    });

    it('should create Anthropic provider', () => {
      const config = createMockConfig('anthropic', 'sk-ant-test');
      const provider = createProvider('anthropic', config);
      expect(provider.name).toBe('anthropic');
    });

    it('should create Gemini provider', () => {
      const config = createMockConfig('gemini', 'aiza-test');
      const provider = createProvider('gemini', config);
      expect(provider.name).toBe('gemini');
    });

    it('should create DeepSeek provider', () => {
      const config = createMockConfig('deepseek', 'sk-test');
      const provider = createProvider('deepseek', config);
      expect(provider.name).toBe('deepseek');
    });

    it('should create Chinese provider for qwen', () => {
      const config = createMockConfig('qwen', 'sk-qwen-test');
      const provider = createProvider('qwen', config);
      expect(provider.name).toBe('qwen');
    });

    it('should create Chinese provider for moonshot', () => {
      const config = createMockConfig('moonshot', 'sk-moonshot-test');
      const provider = createProvider('moonshot', config);
      expect(provider.name).toBe('moonshot');
    });

    it('should create Chinese provider for yi', () => {
      const config = createMockConfig('yi', 'sk-yi-test');
      const provider = createProvider('yi', config);
      expect(provider.name).toBe('yi');
    });

    it('should create Chinese provider for doubao', () => {
      const config = createMockConfig('doubao', 'sk-doubao-test');
      const provider = createProvider('doubao', config);
      expect(provider.name).toBe('doubao');
    });

    it('should create Chinese provider for custom provider with baseUrl', () => {
      const config = createMockConfig('custom-provider', 'sk-custom', 'https://custom.api.com/v1');
      const provider = createProvider('custom-provider', config);
      expect(provider.name).toBe('custom-provider');
    });

    it('should throw error for unknown provider', () => {
      const config: DragonConfig = {
        defaultProvider: 'unknown',
        providers: {},
      };
      expect(() => createProvider('unknown', config)).toThrow('Unknown provider');
    });

    it('should throw error for missing API key', () => {
      const config: DragonConfig = {
        defaultProvider: 'openai',
        providers: {
          openai: {},
        },
      };
      expect(() => createProvider('openai', config)).toThrow('API key not configured');
    });

    it('should throw error for placeholder API key', () => {
      const config = createMockConfig('openai', 'YOUR_OPENAI_API_KEY');
      expect(() => createProvider('openai', config)).toThrow('API key not configured');
    });

    it('should throw error for empty API key', () => {
      const config = createMockConfig('openai', '');
      expect(() => createProvider('openai', config)).toThrow('API key not configured');
    });

    it('should throw unsupported provider error for unknown without baseUrl', () => {
      const config: DragonConfig = {
        defaultProvider: 'unknown-provider',
        providers: {
          'unknown-provider': {
            apiKey: 'test-key',
            models: ['model-1'],
            defaultModel: 'model-1',
          },
        },
      };
      expect(() => createProvider('unknown-provider', config)).toThrow('Unsupported provider');
    });
  });

  describe('listSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = listSupportedProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('gemini');
      expect(providers).toContain('deepseek');
    });

    it('should include Chinese providers', () => {
      const providers = listSupportedProviders();
      expect(providers).toContain('qwen');
      expect(providers).toContain('moonshot');
      expect(providers).toContain('yi');
      expect(providers).toContain('doubao');
    });

    it('should return array with correct length', () => {
      const providers = listSupportedProviders();
      // 4 main providers + 4 Chinese providers = 8
      expect(providers.length).toBe(8);
    });
  });
});
