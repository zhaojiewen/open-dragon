import { describe, it, expect } from 'vitest';
import {
  AUTOGEN_PROMPT,
  TOKEN_SAVE_THRESHOLD,
  TOKEN_SAVE_CONFIGS,
  isDangerousTool,
  DANGEROUS_TOOL_NAMES,
  type TokenSaveLevel,
  type TokenSaveConfig,
} from '../../../src/repl/config.js';

describe('REPL Config', () => {
  describe('AUTOGEN_PROMPT', () => {
    it('should contain skill creation instruction', () => {
      expect(AUTOGEN_PROMPT).toContain('skill');
      expect(AUTOGEN_PROMPT).toContain('create');
    });
  });

  describe('TOKEN_SAVE_THRESHOLD', () => {
    it('should be 1 million tokens', () => {
      expect(TOKEN_SAVE_THRESHOLD).toBe(1_000_000);
    });
  });

  describe('TOKEN_SAVE_CONFIGS', () => {
    it('should have all levels defined', () => {
      expect(TOKEN_SAVE_CONFIGS.off).toBeDefined();
      expect(TOKEN_SAVE_CONFIGS.mild).toBeDefined();
      expect(TOKEN_SAVE_CONFIGS.moderate).toBeDefined();
      expect(TOKEN_SAVE_CONFIGS.aggressive).toBeDefined();
    });

    it('should have correct maxTokens for each level', () => {
      expect(TOKEN_SAVE_CONFIGS.off.maxTokens).toBe(64000);
      expect(TOKEN_SAVE_CONFIGS.mild.maxTokens).toBe(32000);
      expect(TOKEN_SAVE_CONFIGS.moderate.maxTokens).toBe(16000);
      expect(TOKEN_SAVE_CONFIGS.aggressive.maxTokens).toBe(8000);
    });

    it('should enable cache control for off and mild levels', () => {
      expect(TOKEN_SAVE_CONFIGS.off.cacheControl).toBe(true);
      expect(TOKEN_SAVE_CONFIGS.mild.cacheControl).toBe(true);
      expect(TOKEN_SAVE_CONFIGS.moderate.cacheControl).toBe(false);
      expect(TOKEN_SAVE_CONFIGS.aggressive.cacheControl).toBe(false);
    });

    it('should limit tools only for aggressive level', () => {
      expect(TOKEN_SAVE_CONFIGS.off.limitTools).toBe(false);
      expect(TOKEN_SAVE_CONFIGS.mild.limitTools).toBe(false);
      expect(TOKEN_SAVE_CONFIGS.moderate.limitTools).toBe(false);
      expect(TOKEN_SAVE_CONFIGS.aggressive.limitTools).toBe(true);
    });

    it('should have thinking enabled for off and mild', () => {
      expect(TOKEN_SAVE_CONFIGS.off.thinking).toBeDefined();
      expect(TOKEN_SAVE_CONFIGS.mild.thinking).toBeDefined();
      expect(TOKEN_SAVE_CONFIGS.moderate.thinking).toBeUndefined();
      expect(TOKEN_SAVE_CONFIGS.aggressive.thinking).toBeUndefined();
    });

    it('should have enableCompaction true for off and mild', () => {
      expect(TOKEN_SAVE_CONFIGS.off.enableCompaction).toBe(true);
      expect(TOKEN_SAVE_CONFIGS.mild.enableCompaction).toBe(true);
      expect(TOKEN_SAVE_CONFIGS.moderate.enableCompaction).toBe(false);
      expect(TOKEN_SAVE_CONFIGS.aggressive.enableCompaction).toBe(false);
    });
  });

  describe('isDangerousTool', () => {
    it('should return true for bash', () => {
      expect(isDangerousTool('bash')).toBe(true);
    });

    it('should return true for write', () => {
      expect(isDangerousTool('write')).toBe(true);
    });

    it('should return true for edit', () => {
      expect(isDangerousTool('edit')).toBe(true);
    });

    it('should return true for agent', () => {
      expect(isDangerousTool('agent')).toBe(true);
    });

    it('should return false for read', () => {
      expect(isDangerousTool('read')).toBe(false);
    });

    it('should return false for glob', () => {
      expect(isDangerousTool('glob')).toBe(false);
    });

    it('should return false for grep', () => {
      expect(isDangerousTool('grep')).toBe(false);
    });

    it('should return false for webfetch', () => {
      expect(isDangerousTool('webfetch')).toBe(false);
    });

    it('should return false for unknown tool', () => {
      expect(isDangerousTool('unknown')).toBe(false);
    });
  });

  describe('DANGEROUS_TOOL_NAMES', () => {
    it('should contain bash, write, edit, agent', () => {
      expect(DANGEROUS_TOOL_NAMES.has('bash')).toBe(true);
      expect(DANGEROUS_TOOL_NAMES.has('write')).toBe(true);
      expect(DANGEROUS_TOOL_NAMES.has('edit')).toBe(true);
      expect(DANGEROUS_TOOL_NAMES.has('agent')).toBe(true);
    });

    it('should have exactly 4 dangerous tools', () => {
      expect(DANGEROUS_TOOL_NAMES.size).toBe(4);
    });
  });
});