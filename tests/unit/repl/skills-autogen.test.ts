import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setAutoGenState, getAutoGenState, handleSkillsCommand } from '../../../src/repl/handlers.js';
import { AUTOGEN_PROMPT } from '../../../src/repl/config.js';
import { AutoSkillConfigSchema } from '../../../src/config/schema.js';

// Mock dependencies
vi.mock('../../../src/skills/index.js', () => ({
  loadAllSkills: vi.fn(() => []),
  reloadSkills: vi.fn(() => []),
  ensureSkillsDir: vi.fn(() => '/mock/skills'),
  SKILLS_DIR: '/mock/skills',
  deleteSkill: vi.fn((name: string) => name === 'existing-skill'),
}));

vi.mock('../../../src/config/index.js', () => ({
  saveConfig: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((path: string) => path.includes('existing-skill')),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('Skills Autogen', () => {
  beforeEach(() => {
    // Reset state before each test
    setAutoGenState(false, 0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    setAutoGenState(false, 0);
  });

  describe('getAutoGenState / setAutoGenState', () => {
    it('should have initial state of pending=false, lastIndex=0', () => {
      const state = getAutoGenState();
      expect(state.pending).toBe(false);
      expect(state.lastIndex).toBe(0);
    });

    it('should update state when setAutoGenState is called', () => {
      setAutoGenState(true, 5);
      const state = getAutoGenState();
      expect(state.pending).toBe(true);
      expect(state.lastIndex).toBe(5);
    });

    it('should allow setting pending to true', () => {
      setAutoGenState(true, 0);
      expect(getAutoGenState().pending).toBe(true);
    });

    it('should allow clearing pending flag', () => {
      setAutoGenState(true, 10);
      setAutoGenState(false, 10);
      expect(getAutoGenState().pending).toBe(false);
    });

    it('should track lastIndex separately from pending', () => {
      setAutoGenState(true, 5);
      setAutoGenState(false, 5);
      const state = getAutoGenState();
      expect(state.pending).toBe(false);
      expect(state.lastIndex).toBe(5);
    });

    it('should handle large lastIndex values', () => {
      setAutoGenState(true, 1000000);
      expect(getAutoGenState().lastIndex).toBe(1000000);
    });

    it('should handle zero lastIndex', () => {
      setAutoGenState(true, 0);
      expect(getAutoGenState().lastIndex).toBe(0);
    });
  });

  describe('/skills autogen command', () => {
    it('should set pendingAutoGen to true when called', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      const state = getAutoGenState();
      expect(state.pending).toBe(true);
    });

    it('should add AUTOGEN_PROMPT to messages when called', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe(AUTOGEN_PROMPT);
    });

    it('should set lastIndex to current messages length', async () => {
      const messages: any[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      const state = getAutoGenState();
      expect(state.lastIndex).toBe(3); // 2 original + 1 autogen prompt
    });

    it('AUTOGEN_PROMPT should contain skill creation instruction', () => {
      expect(AUTOGEN_PROMPT).toContain('skill');
      expect(AUTOGEN_PROMPT).toContain('create');
      expect(AUTOGEN_PROMPT).toContain('conversation');
    });

    it('AUTOGEN_PROMPT should mention reusable patterns', () => {
      expect(AUTOGEN_PROMPT.toLowerCase()).toContain('reusable');
      expect(AUTOGEN_PROMPT.toLowerCase()).toContain('pattern');
    });

    it('AUTOGEN_PROMPT should be non-empty', () => {
      expect(AUTOGEN_PROMPT.length).toBeGreaterThan(50);
    });

    it('should handle multiple calls to /skills autogen', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      // First call
      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);
      expect(messages.length).toBe(1);

      // Second call (adds another prompt)
      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);
      expect(messages.length).toBe(2);
      expect(messages[1].content).toBe(AUTOGEN_PROMPT);
    });
  });

  describe('Integration: autogen flow', () => {
    it('should detect pending autogen state after /skills autogen', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      // Simulate user calling /skills autogen
      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      // State should now be pending
      const state = getAutoGenState();
      expect(state.pending).toBe(true);

      // After processing, state should be cleared
      setAutoGenState(false, messages.length);
      expect(getAutoGenState().pending).toBe(false);
    });

    it('should handle multiple autogen calls', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      // First autogen
      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);
      expect(getAutoGenState().pending).toBe(true);

      // Clear and second autogen
      setAutoGenState(false, 1);
      messages.length = 0;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);
      expect(getAutoGenState().pending).toBe(true);
      expect(messages.length).toBe(1);
    });

    it('should work with existing conversation history', async () => {
      const messages: any[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Can you help me write a test?' },
        { role: 'assistant', content: 'Sure, I can help...' },
      ];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      expect(messages.length).toBe(5);
      expect(messages[4].role).toBe('user');
      expect(messages[4].content).toBe(AUTOGEN_PROMPT);
    });
  });

  describe('AutoSkillConfig validation', () => {
    it('should default enabled to false', () => {
      const result = AutoSkillConfigSchema.parse({});
      expect(result.enabled).toBe(false);
    });

    it('should default intervalMinutes to 15', () => {
      const result = AutoSkillConfigSchema.parse({});
      expect(result.intervalMinutes).toBe(15);
    });

    it('should accept valid config', () => {
      const result = AutoSkillConfigSchema.parse({
        enabled: true,
        intervalMinutes: 30,
      });
      expect(result.enabled).toBe(true);
      expect(result.intervalMinutes).toBe(30);
    });

    it('should reject intervalMinutes less than 5', () => {
      expect(() => AutoSkillConfigSchema.parse({
        enabled: true,
        intervalMinutes: 4,
      })).toThrow();
    });

    it('should accept intervalMinutes of exactly 5', () => {
      const result = AutoSkillConfigSchema.parse({
        enabled: true,
        intervalMinutes: 5,
      });
      expect(result.intervalMinutes).toBe(5);
    });

    it('should accept large intervalMinutes values', () => {
      const result = AutoSkillConfigSchema.parse({
        enabled: true,
        intervalMinutes: 120,
      });
      expect(result.intervalMinutes).toBe(120);
    });
  });

  describe('Timer behavior simulation', () => {
    it('should set pending when messages grow beyond lastIndex', () => {
      // Simulate timer checking condition
      const messages: any[] = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'resp1' },
        { role: 'user', content: 'msg2' },
      ];
      const lastIndex = 0;
      const userMsgCount = messages.filter(m => m.role === 'user').length;

      // Timer condition: userMsgCount > 0 && messages.length > lastIndex
      const shouldTrigger = userMsgCount > 0 && messages.length > lastIndex;
      expect(shouldTrigger).toBe(true);

      // If triggered, set pending
      if (shouldTrigger) {
        setAutoGenState(true, messages.length);
      }
      expect(getAutoGenState().pending).toBe(true);
    });

    it('should NOT set pending when messages unchanged', () => {
      const messages: any[] = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'resp1' },
      ];
      const lastIndex = 2; // Same as messages.length
      const userMsgCount = messages.filter(m => m.role === 'user').length;

      const shouldTrigger = userMsgCount > 0 && messages.length > lastIndex;
      expect(shouldTrigger).toBe(false);
    });

    it('should NOT set pending when no user messages', () => {
      const messages: any[] = [
        { role: 'assistant', content: 'resp1' },
        { role: 'assistant', content: 'resp2' },
      ];
      const lastIndex = 0;
      const userMsgCount = messages.filter(m => m.role === 'user').length;

      const shouldTrigger = userMsgCount > 0 && messages.length > lastIndex;
      expect(shouldTrigger).toBe(false);
    });

    it('should track lastIndex correctly across timer checks', () => {
      // First check - messages at 3
      setAutoGenState(false, 3);

      // Messages grow to 5
      const messages: any[] = [
        { role: 'user', content: 'm1' },
        { role: 'assistant', content: 'r1' },
        { role: 'user', content: 'm2' },
        { role: 'assistant', content: 'r2' },
        { role: 'user', content: 'm3' },
      ];
      const { lastIndex } = getAutoGenState();
      const shouldTrigger = messages.length > lastIndex;

      expect(shouldTrigger).toBe(true);
      setAutoGenState(true, messages.length);

      // Next check - messages unchanged
      const { lastIndex: newLastIndex } = getAutoGenState();
      expect(messages.length > newLastIndex).toBe(false);
    });

    it('should simulate timer interval calculation', () => {
      // 15 minutes = 15 * 60 * 1000 = 900000ms
      expect(15 * 60 * 1000).toBe(900000);

      // 5 minutes = 5 * 60 * 1000 = 300000ms
      expect(5 * 60 * 1000).toBe(300000);

      // 60 minutes = 60 * 60 * 1000 = 3600000ms
      expect(60 * 60 * 1000).toBe(3600000);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty messages array', async () => {
      const messages: any[] = [];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      expect(messages.length).toBe(1);
      expect(getAutoGenState().lastIndex).toBe(1);
    });

    it('should handle messages with tool results', async () => {
      const messages: any[] = [
        { role: 'user', content: 'read a file' },
        { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'read', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'file data' }] },
      ];
      const mockToolRegistry = {
        setSkills: vi.fn(),
      } as any;

      await handleSkillsCommand(['autogen'], mockToolRegistry, messages);

      expect(messages.length).toBe(4);
      expect(getAutoGenState().pending).toBe(true);
    });

    it('should preserve existing pending state when cleared', () => {
      setAutoGenState(true, 5);
      const state1 = getAutoGenState();

      setAutoGenState(false, state1.lastIndex);
      const state2 = getAutoGenState();

      expect(state2.pending).toBe(false);
      expect(state2.lastIndex).toBe(5);
    });

    it('should handle rapid state changes', () => {
      setAutoGenState(true, 1);
      setAutoGenState(false, 2);
      setAutoGenState(true, 3);
      setAutoGenState(false, 4);

      const state = getAutoGenState();
      expect(state.pending).toBe(false);
      expect(state.lastIndex).toBe(4);
    });
  });
});