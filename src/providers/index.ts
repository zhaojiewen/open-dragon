import type { AIProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { DeepSeekProvider } from './deepseek.js';
import { ChineseProvider, CHINESE_PROVIDERS } from './chinese.js';
import type { DragonConfig } from '../config/index.js';

export function createProvider(providerName: string, config: DragonConfig): AIProvider {
  const providerConfig = config.providers[providerName];

  if (!providerConfig) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith('YOUR_')) {
    throw new Error(`API key not configured for provider: ${providerName}`);
  }

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        models: providerConfig.models,
        defaultModel: providerConfig.defaultModel,
      });

    case 'anthropic':
      return new AnthropicProvider({
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        models: providerConfig.models,
        defaultModel: providerConfig.defaultModel,
      });

    case 'gemini':
      return new GeminiProvider({
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        models: providerConfig.models,
        defaultModel: providerConfig.defaultModel,
      });

    case 'deepseek':
      return new DeepSeekProvider({
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        models: providerConfig.models,
        defaultModel: providerConfig.defaultModel,
      });

    default:
      // Check if it's a Chinese provider
      if (providerName in CHINESE_PROVIDERS || providerConfig.baseUrl) {
        return new ChineseProvider({
          name: providerName,
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          models: providerConfig.models,
          defaultModel: providerConfig.defaultModel,
        });
      }

      throw new Error(`Unsupported provider: ${providerName}`);
  }
}

export function listSupportedProviders(): string[] {
  return [
    'openai',
    'anthropic',
    'gemini',
    'deepseek',
    ...Object.keys(CHINESE_PROVIDERS),
  ];
}

export type { AIProvider };
