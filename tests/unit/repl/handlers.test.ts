import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleWorkspaceCommand,
  handleSkillsCommand,
  setAutoGenState,
  getAutoGenState,
} from '../../../src/repl/handlers.js';
import type { DragonConfig } from '../../../src/config/schema.js';
import type { ToolRegistry } from '../../../src/tools/index.js';
import type { Message } from '../../../src/providers/base.js';
import { AUTOGEN_PROMPT } from '../../../src/repl/config.js';

// Mock chalk - must be at top level, hoisted
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

// Mock fs module - must be at top level, hoisted
vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
  };
  return { default: mockFs };
});

// Mock path module - must be at top level, hoisted
vi.mock('path', () => ({
  default: {
    resolve: vi.fn((p: string) => {
      // Handle absolute paths without adding extra slash
      if (p.startsWith('/')) return p;
      return `/resolved/${p}`;
    }),
    join: vi.fn((...args: string[]) => args.join('/')),
    parse: vi.fn((p: string) => ({
      name: p.split('/').pop()?.replace('.md', '') || '',
      dir: p.split('/').slice(0, -1).join('/')
    })),
    basename: vi.fn((p: string) => p.split('/').pop() || ''),
  },
}));

// Mock os module - must be at top level, hoisted
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/user'),
  },
  homedir: vi.fn(() => '/home/user'),
}));

// Mock skills loader - must be at top level, hoisted
vi.mock('../../../src/skills/index.js', () => {
  const mockSkillsDir = '/home/user/.dragon/skills';
  return {
    loadAllSkills: vi.fn(() => []),
    reloadSkills: vi.fn(() => []),
    ensureSkillsDir: vi.fn(() => mockSkillsDir),
    deleteSkill: vi.fn(() => false),
    SKILLS_DIR: mockSkillsDir,
  };
});

// Mock saveConfig - must be at top level, hoisted
vi.mock('../../../src/config/index.js', () => ({
  saveConfig: vi.fn(),
}));

// Mock child_process spawnSync - must be at top level, hoisted
vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

// Import mocked modules for accessing mock functions
import fs from 'fs';
import path from 'path';
import * as skillsIndex from '../../../src/skills/index.js';
import * as configIndex from '../../../src/config/index.js';
import { spawnSync } from 'child_process';

describe('handlers', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let mockConfig: DragonConfig;
  let mockToolRegistry: ToolRegistry;
  let mockMessages: Message[];

  beforeEach(() => {
    // Reset mocks individually - this is more reliable than vi.clearAllMocks()
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReset();
    (fs.writeFileSync as ReturnType<typeof vi.fn>).mockReset();
    (fs.statSync as ReturnType<typeof vi.fn>).mockReset();
    (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReset();
    (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReset();
    (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReset();
    (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockReset();
    (spawnSync as ReturnType<typeof vi.fn>).mockReset();

    // Reset module state for autoGen
    setAutoGenState(false, 0);

    // Set default mock values AFTER reset
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.writeFileSync as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ isDirectory: () => false } as any);
    (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 } as any);

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Default config
    mockConfig = {
      defaultProvider: 'anthropic',
      providers: {
        anthropic: { apiKey: 'test-key', baseUrl: '', models: [], defaultModel: 'claude-3' },
      },
      workspace: {
        paths: ['/existing/path'],
        writeEnabled: true,
        enforceBounds: true,
        allowHomeDir: true,
      },
    };

    // Mock tool registry
    mockToolRegistry = {
      setWorkspaceScope: vi.fn(),
      setSkills: vi.fn(),
    } as unknown as ToolRegistry;

    mockMessages = [];
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ============================================================
  // setAutoGenState and getAutoGenState
  // ============================================================
  describe('setAutoGenState and getAutoGenState', () => {
    it('should initialize with default state', () => {
      const state = getAutoGenState();
      expect(state.pending).toBe(false);
      expect(state.lastIndex).toBe(0);
    });

    it('should set pending to true', () => {
      setAutoGenState(true, 5);
      const state = getAutoGenState();
      expect(state.pending).toBe(true);
      expect(state.lastIndex).toBe(5);
    });

    it('should set pending to false', () => {
      setAutoGenState(true, 10);
      setAutoGenState(false, 0);
      const state = getAutoGenState();
      expect(state.pending).toBe(false);
      expect(state.lastIndex).toBe(0);
    });

    it('should update lastIndex independently', () => {
      setAutoGenState(true, 5);
      setAutoGenState(true, 15);
      const state = getAutoGenState();
      expect(state.pending).toBe(true);
      expect(state.lastIndex).toBe(15);
    });

    it('should handle multiple updates', () => {
      setAutoGenState(true, 1);
      expect(getAutoGenState()).toEqual({ pending: true, lastIndex: 1 });

      setAutoGenState(false, 2);
      expect(getAutoGenState()).toEqual({ pending: false, lastIndex: 2 });

      setAutoGenState(true, 100);
      expect(getAutoGenState()).toEqual({ pending: true, lastIndex: 100 });
    });

    it('should persist state across multiple calls', () => {
      setAutoGenState(true, 42);
      // Call getAutoGenState multiple times
      expect(getAutoGenState()).toEqual({ pending: true, lastIndex: 42 });
      expect(getAutoGenState()).toEqual({ pending: true, lastIndex: 42 });
      expect(getAutoGenState()).toEqual({ pending: true, lastIndex: 42 });
    });
  });

  // ============================================================
  // handleWorkspaceCommand
  // ============================================================
  describe('handleWorkspaceCommand', () => {
    describe('add subcommand', () => {
      it('should show usage when missing path argument', async () => {
        const result = await handleWorkspaceCommand(['add'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Usage: /workspace add <path>');
      });

      it('should show error for non-existent path', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const result = await handleWorkspaceCommand(['add', 'nonexistent'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Path does not exist');
        expect(output).toContain('/resolved/nonexistent');
      });

      it('should show message when path already exists in workspace', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (path.resolve as ReturnType<typeof vi.fn>).mockReturnValue('/existing/path');
        mockConfig.workspace!.paths = ['/existing/path'];

        const result = await handleWorkspaceCommand(['add', 'existing/path'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Path already in workspace');
      });

      it('should add valid path to workspace', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (path.resolve as ReturnType<typeof vi.fn>).mockReturnValue('/resolved/new/path');
        mockConfig.workspace!.paths = ['/existing/path'];

        const result = await handleWorkspaceCommand(['add', 'new/path'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.paths).toContain('/resolved/new/path');
        expect(mockToolRegistry.setWorkspaceScope).toHaveBeenCalled();
        expect(configIndex.saveConfig).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Added to workspace');
      });

      it('should initialize workspace if not defined', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (path.resolve as ReturnType<typeof vi.fn>).mockReturnValue('/resolved/new/path');
        mockConfig.workspace = undefined;

        const result = await handleWorkspaceCommand(['add', 'new/path'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace).toBeDefined();
        expect(mockConfig.workspace!.paths).toContain('/resolved/new/path');
        expect(mockConfig.workspace!.enforceBounds).toBe(true);
        expect(mockConfig.workspace!.writeEnabled).toBe(true);
        expect(mockConfig.workspace!.allowHomeDir).toBe(true);
      });

      it('should set enforceBounds to true when adding path', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.enforceBounds = false;

        await handleWorkspaceCommand(['add', '/new/path'], mockConfig, mockToolRegistry);

        expect(mockConfig.workspace!.enforceBounds).toBe(true);
      });

      it('should show error when saveConfig fails', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('Save failed');
        });

        const result = await handleWorkspaceCommand(['add', '/new/path'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Failed to save config');
        expect(output).toContain('Save failed');
      });

      it('should set workspace scope with allowHomeDir enabled', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.allowHomeDir = true;
        process.env.HOME = '/home/user';

        await handleWorkspaceCommand(['add', '/new/path'], mockConfig, mockToolRegistry);

        const setWorkspaceScopeCalls = (mockToolRegistry.setWorkspaceScope as ReturnType<typeof vi.fn>).mock.calls;
        expect(setWorkspaceScopeCalls.length).toBe(1);
        // Second arg should include home dir when allowHomeDir is true
        const [, readPaths] = setWorkspaceScopeCalls[0];
        expect(readPaths).toContain('/home/user');
      });

      it('should use os.homedir when HOME env is not set', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.allowHomeDir = true;
        delete process.env.HOME;

        await handleWorkspaceCommand(['add', 'new/path'], mockConfig, mockToolRegistry);

        const setWorkspaceScopeCalls = (mockToolRegistry.setWorkspaceScope as ReturnType<typeof vi.fn>).mock.calls;
        expect(setWorkspaceScopeCalls.length).toBe(1);
        // Should fall back to os.homedir() when HOME is not set
        const [, readPaths] = setWorkspaceScopeCalls[0];
        expect(readPaths).toContain('/home/user'); // from os.homedir mock
        process.env.HOME = '/home/user';
      });

      it('should set workspace scope without home dir when allowHomeDir disabled', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.allowHomeDir = false;

        await handleWorkspaceCommand(['add', '/new/path'], mockConfig, mockToolRegistry);

        const setWorkspaceScopeCalls = (mockToolRegistry.setWorkspaceScope as ReturnType<typeof vi.fn>).mock.calls;
        expect(setWorkspaceScopeCalls.length).toBe(1);
        const [, readPaths] = setWorkspaceScopeCalls[0];
        expect(readPaths).not.toContain('/home/user');
      });

      it('should handle multiple path additions', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.paths = [];

        (path.resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/resolved/path1');
        await handleWorkspaceCommand(['add', 'path1'], mockConfig, mockToolRegistry);

        (path.resolve as ReturnType<typeof vi.fn>).mockReturnValueOnce('/resolved/path2');
        await handleWorkspaceCommand(['add', 'path2'], mockConfig, mockToolRegistry);

        expect(mockConfig.workspace!.paths.length).toBe(2);
        expect(mockConfig.workspace!.paths).toContain('/resolved/path1');
        expect(mockConfig.workspace!.paths).toContain('/resolved/path2');
      });
    });

    describe('on subcommand', () => {
      it('should enable workspace enforcement with paths configured', async () => {
        mockConfig.workspace!.paths = ['/existing/path'];
        mockConfig.workspace!.enforceBounds = false;

        const result = await handleWorkspaceCommand(['on'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.enforceBounds).toBe(true);
        expect(mockToolRegistry.setWorkspaceScope).toHaveBeenCalled();
        expect(configIndex.saveConfig).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace enforcement enabled');
        expect(output).toContain('Paths: /existing/path');
      });

      it('should show message when no paths configured', async () => {
        mockConfig.workspace!.paths = [];

        const result = await handleWorkspaceCommand(['on'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No workspace paths configured');
        expect(output).toContain('/workspace add <path>');
      });

      it('should show message when workspace undefined', async () => {
        mockConfig.workspace = undefined;

        const result = await handleWorkspaceCommand(['on'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No workspace paths configured');
      });

      it('should handle saveConfig silently on error', async () => {
        mockConfig.workspace!.paths = ['/existing/path'];
        (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('Save error');
        });

        const result = await handleWorkspaceCommand(['on'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.enforceBounds).toBe(true);
      });

      it('should use os.homedir when HOME env is not set for on subcommand', async () => {
        mockConfig.workspace!.paths = ['/existing/path'];
        mockConfig.workspace!.enforceBounds = false;
        mockConfig.workspace!.allowHomeDir = true;
        delete process.env.HOME;

        await handleWorkspaceCommand(['on'], mockConfig, mockToolRegistry);

        const setWorkspaceScopeCalls = (mockToolRegistry.setWorkspaceScope as ReturnType<typeof vi.fn>).mock.calls;
        expect(setWorkspaceScopeCalls.length).toBe(1);
        const [, readPaths] = setWorkspaceScopeCalls[0];
        expect(readPaths).toContain('/home/user'); // from os.homedir mock
        process.env.HOME = '/home/user';
      });
    });

    describe('off subcommand', () => {
      it('should disable workspace enforcement', async () => {
        mockConfig.workspace!.enforceBounds = true;

        const result = await handleWorkspaceCommand(['off'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.enforceBounds).toBe(false);
        expect(mockToolRegistry.setWorkspaceScope).toHaveBeenCalledWith([]);
        expect(configIndex.saveConfig).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace enforcement disabled');
        expect(output).toContain('All paths are now accessible');
      });

      it('should show re-enable hint', async () => {
        const result = await handleWorkspaceCommand(['off'], mockConfig, mockToolRegistry);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('/workspace on');
      });

      it('should handle workspace undefined gracefully', async () => {
        mockConfig.workspace = undefined;

        const result = await handleWorkspaceCommand(['off'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace enforcement disabled');
      });

      it('should handle saveConfig silently on error', async () => {
        (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('Save error');
        });

        const result = await handleWorkspaceCommand(['off'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.enforceBounds).toBe(false);
      });

      it('should not throw when workspace exists but saveConfig fails', async () => {
        mockConfig.workspace!.enforceBounds = true;
        (configIndex.saveConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('disk full');
        });

        // Should not throw
        const result = await handleWorkspaceCommand(['off'], mockConfig, mockToolRegistry);
        expect(result).toBe(true);
      });
    });

    describe('default (show status)', () => {
      it('should show workspace status with paths', async () => {
        mockConfig.workspace!.paths = ['/path1', '/path2'];
        mockConfig.workspace!.enforceBounds = true;

        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace:');
        expect(output).toContain('Status: enforced');
        expect(output).toContain('/path1');
        expect(output).toContain('/path2');
        expect(output).toContain('/workspace add <path>');
        expect(output).toContain('/workspace on|off');
      });

      it('should show disabled status', async () => {
        mockConfig.workspace!.enforceBounds = false;

        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Status: disabled');
      });

      it('should show no paths configured message', async () => {
        mockConfig.workspace!.paths = [];

        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No paths configured');
      });

      it('should handle undefined workspace', async () => {
        mockConfig.workspace = undefined;

        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace:');
        expect(output).toContain('Status: disabled');
        expect(output).toContain('No paths configured');
      });

      it('should show usage hints', async () => {
        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('/workspace add <path>');
        expect(output).toContain('Add directory to workspace');
        expect(output).toContain('Enable/disable enforcement');
      });
    });

    describe('case sensitivity', () => {
      it('should handle uppercase ADD', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        mockConfig.workspace!.paths = [];

        const result = await handleWorkspaceCommand(['ADD', '/new/path'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.paths.length).toBe(1);
      });

      it('should handle uppercase ON', async () => {
        mockConfig.workspace!.paths = ['/path'];

        await handleWorkspaceCommand(['ON'], mockConfig, mockToolRegistry);

        expect(mockConfig.workspace!.enforceBounds).toBe(true);
      });

      it('should handle uppercase OFF', async () => {
        mockConfig.workspace!.enforceBounds = true;

        await handleWorkspaceCommand(['OFF'], mockConfig, mockToolRegistry);

        expect(mockConfig.workspace!.enforceBounds).toBe(false);
      });

      it('should handle mixed case', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

        await handleWorkspaceCommand(['AdD', '/path'], mockConfig, mockToolRegistry);
        expect(mockConfig.workspace!.paths.length).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty args array', async () => {
        const result = await handleWorkspaceCommand([], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace:');
      });

      it('should handle extra arguments', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

        const result = await handleWorkspaceCommand(['add', '/path', 'extra', 'args'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        expect(mockConfig.workspace!.paths.length).toBeGreaterThan(0);
      });

      it('should handle unknown subcommand', async () => {
        const result = await handleWorkspaceCommand(['unknown'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace:');
      });

      it('should handle numeric subcommand', async () => {
        const result = await handleWorkspaceCommand(['123'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Workspace:');
      });

      it('should handle special characters in subcommand', async () => {
        const result = await handleWorkspaceCommand(['@#$'], mockConfig, mockToolRegistry);

        expect(result).toBe(true);
      });
    });
  });

  // ============================================================
  // handleSkillsCommand
  // ============================================================
  describe('handleSkillsCommand', () => {
    describe('reload subcommand', () => {
      it('should reload skills and update toolRegistry', async () => {
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill1', description: 'A skill', content: 'content', sourcePath: '/path1', loadedAt: new Date() },
          { name: 'skill2', description: 'Another skill', content: 'content2', sourcePath: '/path2', loadedAt: new Date() },
        ]);

        await handleSkillsCommand(['reload'], mockToolRegistry, mockMessages);

        expect(skillsIndex.reloadSkills).toHaveBeenCalled();
        expect(mockToolRegistry.setSkills).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Reloaded 2 skill(s)');
        expect(output).toContain(skillsIndex.SKILLS_DIR);
        expect(output).toContain('skill1');
        expect(output).toContain('skill2');
      });

      it('should handle empty skills reload', async () => {
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['reload'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Reloaded 0 skill(s)');
      });

      it('should truncate long descriptions', async () => {
        const longDescription = 'A very long description that exceeds eighty characters limit and should be truncated';
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: longDescription, content: 'content', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand(['reload'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('...');
      });

      it('should show short descriptions fully', async () => {
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'Short desc', content: 'content', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand(['reload'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Short desc');
        expect(output).not.toContain('...');
      });
    });

    describe('create subcommand', () => {
      it('should show usage when missing name', async () => {
        await handleSkillsCommand(['create'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Usage: /skills create <name>');
        expect(output).toContain(skillsIndex.SKILLS_DIR);
      });

      it('should create skill with valid name', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'my-skill'], mockToolRegistry, mockMessages);

        expect(skillsIndex.ensureSkillsDir).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Created skill');
        expect(output).toContain('/skills reload');
      });

      it('should sanitize skill name', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'My Skill!@#'], mockToolRegistry, mockMessages);

        // Name should be sanitized - each non-alphanumeric char becomes a dash
        const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(writeCalls.length).toBe(1);
        // "My Skill!@#" -> "my-skill---" (lowercase, space->dash, !->dash, @->dash, #->dash)
        expect(writeCalls[0][0]).toContain('my-skill---.md');
      });

      it('should show message when skill already exists', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

        await handleSkillsCommand(['create', 'existing-skill'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('already exists');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('should create skill with template content', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'test'], mockToolRegistry, mockMessages);

        const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
        const content = writeCalls[0][1];
        expect(content).toContain('---');
        expect(content).toContain('name:');
        expect(content).toContain('description:');
        expect(content).toContain('# test');
        expect(content).toContain('Guidelines');
      });

      it('should handle lowercase conversion', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'MY-SKILL'], mockToolRegistry, mockMessages);

        const writeCalls = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(writeCalls[0][0]).toContain('my-skill.md');
      });
    });

    describe('edit subcommand', () => {
      it('should show usage when missing name', async () => {
        await handleSkillsCommand(['edit'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Usage: /skills edit <name>');
      });

      it('should edit existing skill file', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(true)  // ensureSkillsDir check
          .mockReturnValueOnce(true); // skill file exists

        await handleSkillsCommand(['edit', 'my-skill'], mockToolRegistry, mockMessages);

        expect(spawnSync).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Opening skill');
      });

      it('should edit directory skill (SKILL.md)', async () => {
        // ensureSkillsDir is mocked, so it doesn't call fs.existsSync
        // First actual fs.existsSync call: skill.md not found
        // Second call: SKILL.md inside directory exists
        (fs.existsSync as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(false)  // skill.md not found
          .mockReturnValueOnce(true);  // SKILL.md inside directory exists

        await handleSkillsCommand(['edit', 'my-skill'], mockToolRegistry, mockMessages);

        expect(spawnSync).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Opening skill');
      });

      it('should use default editor for directory skill when EDITOR not set', async () => {
        // skill.md not found, SKILL.md inside directory exists
        (fs.existsSync as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(false)  // skill.md not found
          .mockReturnValueOnce(true);  // SKILL.md inside directory exists
        delete process.env.EDITOR;

        await handleSkillsCommand(['edit', 'my-skill'], mockToolRegistry, mockMessages);

        const spawnCalls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(spawnCalls[0][0]).toBe('vi'); // defaults to 'vi'
      });

      it('should show error when skill not found', async () => {
        // ensureSkillsDir is mocked, so it doesn't call fs.existsSync
        // skill.md not found, SKILL.md inside dir not found
        (fs.existsSync as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(false) // skill.md not found
          .mockReturnValueOnce(false); // SKILL.md inside dir not found

        await handleSkillsCommand(['edit', 'missing-skill'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('not found');
        expect(spawnSync).not.toHaveBeenCalled();
      });

      it('should use EDITOR environment variable', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true); // skill.md exists
        process.env.EDITOR = 'nano';

        await handleSkillsCommand(['edit', 'skill'], mockToolRegistry, mockMessages);

        const spawnCalls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(spawnCalls[0][0]).toBe('nano');
        process.env.EDITOR = undefined;
      });

      it('should default to vi when EDITOR not set', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true); // skill.md exists
        delete process.env.EDITOR;

        await handleSkillsCommand(['edit', 'skill'], mockToolRegistry, mockMessages);

        const spawnCalls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(spawnCalls[0][0]).toBe('vi');
      });

      it('should ensure skills directory exists', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true); // skill.md exists

        await handleSkillsCommand(['edit', 'skill'], mockToolRegistry, mockMessages);

        expect(skillsIndex.ensureSkillsDir).toHaveBeenCalled();
      });
    });

    describe('delete subcommand', () => {
      it('should show usage when missing name', async () => {
        await handleSkillsCommand(['delete'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Usage: /skills delete <name>');
      });

      it('should delete existing skill', async () => {
        (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['delete', 'my-skill'], mockToolRegistry, mockMessages);

        expect(skillsIndex.deleteSkill).toHaveBeenCalledWith('my-skill');
        expect(skillsIndex.reloadSkills).toHaveBeenCalled();
        expect(mockToolRegistry.setSkills).toHaveBeenCalled();
        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Deleted skill');
      });

      it('should show message when skill not found', async () => {
        (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['delete', 'missing'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('not found');
        expect(skillsIndex.reloadSkills).not.toHaveBeenCalled();
      });

      it('should reload skills after deletion', async () => {
        (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['delete', 'skill'], mockToolRegistry, mockMessages);

        expect(skillsIndex.reloadSkills).toHaveBeenCalled();
        expect(mockToolRegistry.setSkills).toHaveBeenCalledWith([]);
      });
    });

    describe('autogen subcommand', () => {
      it('should add AUTOGEN_PROMPT to messages', async () => {
        mockMessages = [];

        await handleSkillsCommand(['autogen'], mockToolRegistry, mockMessages);

        expect(mockMessages.length).toBe(1);
        expect(mockMessages[0].role).toBe('user');
        expect(mockMessages[0].content).toBe(AUTOGEN_PROMPT);
      });

      it('should set autoGen state', async () => {
        await handleSkillsCommand(['autogen'], mockToolRegistry, mockMessages);

        const state = getAutoGenState();
        expect(state.pending).toBe(true);
        expect(state.lastIndex).toBe(mockMessages.length);
      });

      it('should show autogen message', async () => {
        await handleSkillsCommand(['autogen'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Auto-generating skills');
        expect(output).toContain('analyze patterns');
      });

      it('should append to existing messages', async () => {
        mockMessages = [{ role: 'user', content: 'first message' }];

        await handleSkillsCommand(['autogen'], mockToolRegistry, mockMessages);

        expect(mockMessages.length).toBe(2);
        expect(mockMessages[0].content).toBe('first message');
        expect(mockMessages[1].content).toBe(AUTOGEN_PROMPT);
      });

      it('should update lastIndex based on messages length', async () => {
        mockMessages = [{ role: 'user', content: '1' }, { role: 'assistant', content: '2' }];

        await handleSkillsCommand(['autogen'], mockToolRegistry, mockMessages);

        const state = getAutoGenState();
        expect(state.lastIndex).toBe(3); // 2 existing + 1 added
      });
    });

    describe('default (list skills)', () => {
      it('should list available skills', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill1', description: 'First skill', content: 'content 1', sourcePath: '/path1', loadedAt: new Date() },
          { name: 'skill2', description: 'Second skill', content: 'content 2', sourcePath: '/path2', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Skills (2):');
        expect(output).toContain(skillsIndex.SKILLS_DIR);
        expect(output).toContain('skill1');
        expect(output).toContain('skill2');
      });

      it('should show empty skills message', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No skills found');
        expect(output).toContain(skillsIndex.SKILLS_DIR);
      });

      it('should show skill content preview', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'desc', content: 'Long content that should be truncated', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Long content');
      });

      it('should truncate long content preview', async () => {
        const longContent = 'A'.repeat(100);
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'desc', content: longContent, sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('...');
      });

      it('should show empty body message when content is empty', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'desc', content: '', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('(empty body)');
      });

      it('should show usage hints', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('/skills create <name>');
        // When no skills exist, edit and delete are not shown in hints
        expect(output).toContain('/skills autogen');
        expect(output).toContain('/skills reload');
      });

      it('should show usage hints with skills', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'desc', content: 'content', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('/skills create');
        expect(output).toContain('/skills edit');
        expect(output).toContain('/skills delete');
      });
    });

    describe('case sensitivity', () => {
      it('should handle uppercase RELOAD', async () => {
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['RELOAD'], mockToolRegistry, mockMessages);

        expect(skillsIndex.reloadSkills).toHaveBeenCalled();
      });

      it('should handle uppercase CREATE', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['CREATE', 'skill'], mockToolRegistry, mockMessages);

        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      it('should handle uppercase EDIT', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

        await handleSkillsCommand(['EDIT', 'skill'], mockToolRegistry, mockMessages);

        expect(spawnSync).toHaveBeenCalled();
      });

      it('should handle uppercase DELETE', async () => {
        (skillsIndex.deleteSkill as ReturnType<typeof vi.fn>).mockReturnValue(true);

        await handleSkillsCommand(['DELETE', 'skill'], mockToolRegistry, mockMessages);

        expect(skillsIndex.deleteSkill).toHaveBeenCalled();
      });

      it('should handle uppercase AUTOGEN', async () => {
        mockMessages = [];

        await handleSkillsCommand(['AUTOGEN'], mockToolRegistry, mockMessages);

        expect(mockMessages.length).toBe(1);
      });

      it('should handle mixed case', async () => {
        (skillsIndex.reloadSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['ReLoAd'], mockToolRegistry, mockMessages);

        expect(skillsIndex.reloadSkills).toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle empty args array', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No skills found');
      });

      it('should handle extra arguments', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'skill', 'extra', 'args'], mockToolRegistry, mockMessages);

        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      it('should handle unknown subcommand', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['unknown'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('No skills found');
      });

      it('should handle numeric subcommand', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand(['123'], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('Skills');
      });

      it('should handle special characters in skill name for create', async () => {
        (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await handleSkillsCommand(['create', 'skill-with-dash'], mockToolRegistry, mockMessages);

        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      it('should handle whitespace in subcommand', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([]);

        await handleSkillsCommand([' reload'], mockToolRegistry, mockMessages);

        // ' reload' doesn't match 'reload' due to leading space
        expect(skillsIndex.loadAllSkills).toHaveBeenCalled();
      });

      it('should handle skill with multiline content', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          {
            name: 'skill',
            description: 'desc',
            content: 'Line 1\nLine 2\nLine 3',
            sourcePath: '/path',
            loadedAt: new Date(),
          },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        // Multiline content should be replaced with spaces in preview
        expect(output).toContain('Line 1');
      });
    });

    describe('skills with special characters in description', () => {
      it('should handle skill with quotes in description', async () => {
        (skillsIndex.loadAllSkills as ReturnType<typeof vi.fn>).mockReturnValue([
          { name: 'skill', description: 'A "quoted" description', content: 'content', sourcePath: '/path', loadedAt: new Date() },
        ]);

        await handleSkillsCommand([], mockToolRegistry, mockMessages);

        const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
        expect(output).toContain('quoted');
      });
    });
  });
});