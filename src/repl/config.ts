/**
 * REPL configuration constants and types
 */

export const AUTOGEN_PROMPT = `Review the conversation history above. Identify any reusable workflows, patterns, coding conventions, or tool combinations the user has described or taught you. For each one you find, use the skill tool's create action to save it as a skill so it persists across future sessions. If nothing notable was taught, briefly say so.`;

export const TOKEN_SAVE_THRESHOLD = 1_000_000;

export type TokenSaveLevel = 'off' | 'mild' | 'moderate' | 'aggressive';

export interface TokenSaveConfig {
  label: string;
  thinking: any | undefined;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  maxTokens: number;
  cacheControl: boolean;
  modelSuffix?: string;
  limitTools: boolean;
  enableCompaction: boolean;
  maxToolOutputSize?: number;
}

export const TOKEN_SAVE_CONFIGS: Record<TokenSaveLevel, TokenSaveConfig> = {
  off: {
    label: 'Off',
    thinking: { type: 'adaptive', display: 'summarized' },
    effort: undefined,
    maxTokens: 64000,
    cacheControl: true,
    limitTools: false,
    enableCompaction: true,
  },
  mild: {
    label: 'Mild — thinking on, effort=medium, 32K max',
    thinking: { type: 'adaptive', display: 'summarized' },
    effort: 'medium',
    maxTokens: 32000,
    cacheControl: true,
    limitTools: false,
    enableCompaction: true,
  },
  moderate: {
    label: 'Moderate — no thinking, effort=low, 16K max, no cache writes',
    thinking: undefined,
    effort: 'low',
    maxTokens: 16000,
    cacheControl: false,
    limitTools: false,
    enableCompaction: false,
    maxToolOutputSize: 50000,
  },
  aggressive: {
    label: 'Aggressive — no thinking, 8K max, limited tools',
    thinking: undefined,
    effort: 'low',
    maxTokens: 8000,
    cacheControl: false,
    limitTools: true,
    enableCompaction: false,
    maxToolOutputSize: 10000,
  },
};

export interface SessionState {
  provider: any;
  providerName: string;
  model?: string;
  autoApproveTools: boolean;
  autoApproveOutsideWorkspace: boolean;
  tokenSaveLevel: TokenSaveLevel;
  tokenSavePrompted: boolean;
}

export interface ReplOptions {
  provider?: string;
  model?: string;
  enableMonitoring?: boolean;
  enableEncryption?: boolean;
  tokenSaveLevel?: TokenSaveLevel;
}

// Tools that require user confirmation before executing
export const DANGEROUS_TOOL_NAMES = new Set(['bash', 'write', 'edit', 'agent']);

export function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOL_NAMES.has(name);
}