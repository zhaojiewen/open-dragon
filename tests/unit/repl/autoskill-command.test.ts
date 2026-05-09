import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAutoskillCommand } from '../../../src/repl/commands.js';
import { saveConfig } from '../../../src/config/index.js';
import type { DragonConfig } from '../../../src/config/index.js';

vi.mock('../../../src/config/index.js', () => ({
  saveConfig: vi.fn(),
}));

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

describe('/autoskill command', () => {
  let mockConfig: DragonConfig;
  let consoleSpy: any;

  beforeEach(() => {
    mockConfig = {
      defaultProvider: 'anthropic',
      providers: {},
    } as DragonConfig;
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('show status (no args)', () => {
    it('should show current status when no autoSkill config', () => {
      handleAutoskillCommand([], mockConfig);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('disabled');
    });

    it('should show enabled status when autoSkill is configured', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 30 };
      handleAutoskillCommand([], mockConfig);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('enabled');
      expect(output).toContain('30');
    });

    it('should show interval in minutes', () => {
      mockConfig.autoSkill = { enabled: false, intervalMinutes: 45 };
      handleAutoskillCommand([], mockConfig);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('45');
    });
  });

  describe('/autoskill on', () => {
    it('should enable with default 15 minutes', () => {
      handleAutoskillCommand(['on'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should enable with custom interval', () => {
      handleAutoskillCommand(['on', '30'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(30);
    });

    it('should reject interval less than 5', () => {
      handleAutoskillCommand(['on', '3'], mockConfig);

      expect(mockConfig.autoSkill).toBeUndefined();
    });

    it('should accept interval of exactly 5', () => {
      handleAutoskillCommand(['on', '5'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(5);
    });

    it('should accept large intervals', () => {
      handleAutoskillCommand(['on', '120'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(120);
    });

    it('should show restart message', () => {
      handleAutoskillCommand(['on', '30'], mockConfig);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Restart');
    });
  });

  describe('/autoskill off', () => {
    it('should disable auto-skill', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 30 };
      handleAutoskillCommand(['off'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(false);
    });

    it('should create config if not exists', () => {
      handleAutoskillCommand(['off'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(false);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should preserve interval when disabling', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 60 };
      handleAutoskillCommand(['off'], mockConfig);

      expect(mockConfig.autoSkill?.intervalMinutes).toBe(60);
    });
  });

  describe('/autoskill interval', () => {
    it('should change interval without changing enabled', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '60'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(true);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(60);
    });

    it('should set interval when disabled', () => {
      mockConfig.autoSkill = { enabled: false, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '45'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(false);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(45);
    });

    it('should create config if not exists', () => {
      handleAutoskillCommand(['interval', '30'], mockConfig);

      expect(mockConfig.autoSkill?.enabled).toBe(false);
      expect(mockConfig.autoSkill?.intervalMinutes).toBe(30);
    });

    it('should reject invalid interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '2'], mockConfig);

      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should reject non-numeric interval', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', 'abc'], mockConfig);

      expect(mockConfig.autoSkill?.intervalMinutes).toBe(15);
    });

    it('should accept "set" alias', () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['set', '45'], mockConfig);

      expect(mockConfig.autoSkill?.intervalMinutes).toBe(45);
    });
  });

  describe('config persistence', () => {
    it('should call saveConfig when enabling', async () => {
      handleAutoskillCommand(['on', '30'], mockConfig);

      await new Promise(r => setTimeout(r, 50));
      expect(saveConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('should call saveConfig when disabling', async () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 30 };
      handleAutoskillCommand(['off'], mockConfig);

      await new Promise(r => setTimeout(r, 50));
      expect(saveConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('should call saveConfig when changing interval', async () => {
      mockConfig.autoSkill = { enabled: true, intervalMinutes: 15 };
      handleAutoskillCommand(['interval', '60'], mockConfig);

      await new Promise(r => setTimeout(r, 50));
      expect(saveConfig).toHaveBeenCalledWith(mockConfig);
    });
  });
});