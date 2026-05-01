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

export const ExecutionLimitsSchema = z.object({
  maxToolCallsPerTurn: z.number().default(25),
  maxTotalToolCalls: z.number().default(200),
  maxOutputSize: z.number().default(100000), // 100KB
});

export const ToolsConfigSchema = z.object({
  enabled: z.array(z.string()).default(['bash', 'read', 'write', 'edit']),
  bash: BashToolConfigSchema.optional(),
  executionLimits: ExecutionLimitsSchema.optional(),
});

export const LogConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
  enableConsole: z.boolean().default(true),
});

export type LogConfig = z.infer<typeof LogConfigSchema>;

export const WorkspaceConfigSchema = z.object({
  paths: z.array(z.string()).default([]).describe('Allowed workspace root directories'),
  writeEnabled: z.boolean().default(true).describe('Allow write operations within workspace'),
  enforceBounds: z.boolean().default(true).describe('Enforce workspace boundary for all file operations'),
  allowHomeDir: z.boolean().default(true).describe('Allow read access to home directory config files'),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export const DragonConfigSchema = z.object({
  defaultProvider: z.string().default('anthropic'),
  defaultTokenSaveLevel: z.enum(['off', 'mild', 'moderate', 'aggressive']).default('off'),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  tools: ToolsConfigSchema.optional(),
  logging: LogConfigSchema.optional(),
  workspace: WorkspaceConfigSchema.optional(),
}).refine((config) => {
  // Validate that defaultProvider exists in providers
  if (Object.keys(config.providers).length > 0 && !config.providers[config.defaultProvider]) {
    return false;
  }
  return true;
}, {
  message: "defaultProvider must be defined in providers",
  path: ["defaultProvider"],
}).refine((config) => {
  // Validate that the default provider doesn't use a placeholder API key
  const defaultProvider = config.providers[config.defaultProvider];
  if (defaultProvider?.apiKey && defaultProvider.apiKey.startsWith('YOUR_')) {
    return false;
  }
  return true;
}, {
  message: 'API key for default provider must not be a placeholder value (YOUR_...)',
  path: ['providers'],
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type DragonConfig = z.infer<typeof DragonConfigSchema>;

export const DEFAULT_CONFIG: DragonConfig = {
  defaultProvider: 'anthropic',
  defaultTokenSaveLevel: 'off',
  providers: {
    openai: {
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o',
    },
    anthropic: {
      models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
      defaultModel: 'claude-opus-4-7',
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
    executionLimits: {
      maxToolCallsPerTurn: 25,
      maxTotalToolCalls: 200,
      maxOutputSize: 100000,
    },
  },
  logging: {
    level: 'info',
    enableConsole: true,
  },
  workspace: {
    paths: [],
    writeEnabled: true,
    enforceBounds: false,
    allowHomeDir: true,
  },
};
