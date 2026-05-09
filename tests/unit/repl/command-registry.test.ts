import { describe, it, expect } from 'vitest';
import {
  getCompletions,
  getSubCompletions,
  getHints,
  getCommandsByCategory,
  isValidCommand,
  getCommand,
  COMMAND_REGISTRY,
} from '../../../src/repl/command-registry.js';

describe('Command Registry', () => {
  describe('COMMAND_REGISTRY', () => {
    it('should contain all expected commands', () => {
      const commandNames = COMMAND_REGISTRY.map(c => c.name);
      expect(commandNames).toContain('help');
      expect(commandNames).toContain('exit');
      expect(commandNames).toContain('model');
      expect(commandNames).toContain('provider');
      expect(commandNames).toContain('workspace');
    });

    it('should have aliases defined', () => {
      const exitCmd = COMMAND_REGISTRY.find(c => c.name === 'exit');
      expect(exitCmd?.aliases).toContain('quit');

      const wsCmd = COMMAND_REGISTRY.find(c => c.name === 'workspace');
      expect(wsCmd?.aliases).toContain('ws');

      const ecoCmd = COMMAND_REGISTRY.find(c => c.name === 'save-tokens');
      expect(ecoCmd?.aliases).toContain('eco');
    });

    it('should have subCommands defined where appropriate', () => {
      const wsCmd = COMMAND_REGISTRY.find(c => c.name === 'workspace');
      expect(wsCmd?.subCommands).toContain('add');
      expect(wsCmd?.subCommands).toContain('on');
      expect(wsCmd?.subCommands).toContain('off');

      const skillsCmd = COMMAND_REGISTRY.find(c => c.name === 'skills');
      expect(skillsCmd?.subCommands).toContain('list');
      expect(skillsCmd?.subCommands).toContain('reload');
    });
  });

  describe('getCompletions', () => {
    it('should return empty array for non-command input', () => {
      expect(getCompletions('hello')).toEqual([]);
      expect(getCompletions('')).toEqual([]);
    });

    it('should return all commands for empty "/"', () => {
      const completions = getCompletions('/');
      expect(completions.length).toBeGreaterThan(10);
      expect(completions).toContain('/help');
      expect(completions).toContain('/exit');
    });

    it('should return matching commands for partial input', () => {
      expect(getCompletions('/he')).toEqual(['/help']);
      expect(getCompletions('/ex')).toEqual(['/exit']);
      expect(getCompletions('/mod')).toEqual(['/model']);
    });

    it('should return multiple matches for ambiguous partial', () => {
      const completions = getCompletions('/s');
      expect(completions).toContain('/save');
      expect(completions).toContain('/skills');
      expect(completions).toContain('/save-tokens');
    });

    it('should include aliases in completions', () => {
      const completions = getCompletions('/w');
      expect(completions).toContain('/workspace');
      expect(completions).toContain('/ws');
    });

    it('should return empty array for unknown partial', () => {
      expect(getCompletions('/xyz')).toEqual([]);
    });
  });

  describe('getSubCompletions', () => {
    it('should return sub-command completions', () => {
      const completions = getSubCompletions('/workspace a');
      expect(completions).toContain('/workspace add');
    });

    it('should return completions for partial sub-command', () => {
      const completions = getSubCompletions('/skills re');
      expect(completions).toContain('/skills reload');
    });

    it('should return empty array for commands without subcommands', () => {
      expect(getSubCompletions('/help x')).toEqual([]);
      expect(getSubCompletions('/exit a')).toEqual([]);
    });

    it('should return empty array for non-command input', () => {
      expect(getSubCompletions('hello test')).toEqual([]);
    });

    it('should handle alias commands', () => {
      const completions = getSubCompletions('/ws a');
      expect(completions).toContain('/ws add');
    });
  });

  describe('getHints', () => {
    it('should return null for non-command input', () => {
      expect(getHints('hello')).toBeNull();
      expect(getHints('')).toBeNull();
    });

    it('should return general tip for empty "/"', () => {
      const hint = getHints('/');
      expect(hint).toContain('Commands');
      expect(hint).toContain('/help');
    });

    it('should return command-specific hint for exact match', () => {
      const hint = getHints('/model');
      expect(hint).toContain('Show or change model');
    });

    it('should include usage in hint when defined', () => {
      const hint = getHints('/load');
      expect(hint).toContain('Usage');
    });

    it('should include subCommands in hint when defined', () => {
      const hint = getHints('/workspace');
      expect(hint).toContain('Options');
      expect(hint).toContain('add');
    });

    it('should return multiple matches hint for ambiguous partial', () => {
      const hint = getHints('/s');
      expect(hint).toContain('Matches');
    });

    it('should return unknown command hint for unknown partial', () => {
      const hint = getHints('/xyz');
      expect(hint).toContain('Unknown command');
    });
  });

  describe('getCommandsByCategory', () => {
    it('should group commands by category', () => {
      const grouped = getCommandsByCategory();
      expect(grouped['session']).toBeDefined();
      expect(grouped['provider']).toBeDefined();
      expect(grouped['diagnostics']).toBeDefined();
    });

    it('should have correct commands in session category', () => {
      const grouped = getCommandsByCategory();
      const sessionNames = grouped['session'].map(c => c.name);
      expect(sessionNames).toContain('help');
      expect(sessionNames).toContain('clear');
      expect(sessionNames).toContain('history');
    });
  });

  describe('isValidCommand', () => {
    it('should return true for valid commands', () => {
      expect(isValidCommand('/help')).toBe(true);
      expect(isValidCommand('/exit')).toBe(true);
      expect(isValidCommand('/model')).toBe(true);
    });

    it('should return true for aliases', () => {
      expect(isValidCommand('/quit')).toBe(true);
      expect(isValidCommand('/ws')).toBe(true);
      expect(isValidCommand('/eco')).toBe(true);
    });

    it('should return false for invalid commands', () => {
      expect(isValidCommand('/xyz')).toBe(false);
      expect(isValidCommand('/unknown')).toBe(false);
    });

    it('should return false for non-command input', () => {
      expect(isValidCommand('hello')).toBe(false);
      expect(isValidCommand('')).toBe(false);
    });
  });

  describe('getCommand', () => {
    it('should return command metadata by name', () => {
      const cmd = getCommand('help');
      expect(cmd?.name).toBe('help');
      expect(cmd?.description).toContain('Show');
    });

    it('should return command metadata by alias', () => {
      const cmd = getCommand('quit');
      expect(cmd?.name).toBe('exit');
    });

    it('should return undefined for unknown command', () => {
      expect(getCommand('xyz')).toBeUndefined();
    });
  });
});