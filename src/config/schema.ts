import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(z.string()).optional(),
  defaultModel: z.string().optional(),
});

export const BashToolConfigSchema = z.object({
  dangerouslyDisableSandbox: z.boolean().default(false),
});

export const ToolsConfigSchema = z.object({
  enabled: z.array(z.string()).default(['bash', 'read', 'write', 'edit']),
  bash: BashToolConfigSchema.optional(),
});

export const LogConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
  enableConsole: z.boolean().default(true),
});

export type LogConfig = z.infer<typeof LogConfigSchema>;

export const DragonConfigSchema = z.object({
  defaultProvider: z.string().default('anthropic'),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  tools: ToolsConfigSchema.optional(),
  logging: LogConfigSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type DragonConfig = z.infer<typeof DragonConfigSchema>;

export const DEFAULT_CONFIG: DragonConfig = {
  defaultProvider: 'anthropic',
  providers: {
    openai: {
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o',
    },
    anthropic: {
      models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
      defaultModel: 'claude-sonnet-4-6',
    },
    gemini: {
      models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-1.5-pro',
    },
    deepseek: {
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
    },
    qwen: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
      defaultModel: 'qwen-max',
    },
  },
  tools: {
    enabled: ['bash', 'read', 'write', 'edit', 'agent', 'websearch', 'webfetch', 'glob', 'grep'],
    bash: {
      dangerouslyDisableSandbox: false,
    },
  },
  logging: {
    level: 'info',
    enableConsole: true,
  },
};
