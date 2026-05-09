import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAskCommand } from '../../../src/repl/commands.js';
import type { SessionState } from '../../../src/repl/config.js';

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

describe('/ask command', () => {
  let mockSession: SessionState;
  let consoleSpy: any;

  beforeEach(() => {
    mockSession = {
      provider: {} as any,
      providerName: 'anthropic',
      model: 'claude-3-5-sonnet',
      autoApproveTools: false,
      autoApproveOutsideWorkspace: false,
      tokenSaveLevel: 'off',
      tokenSavePrompted: false,
    };
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('/ask (no args)', () => {
    it('should enable strict mode', () => {
      mockSession.autoApproveTools = true;
      mockSession.autoApproveOutsideWorkspace = true;
      handleAskCommand([], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should show success message', () => {
      handleAskCommand([], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Strict mode enabled');
    });

    it('should show confirmation hints', () => {
      handleAskCommand([], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('y=approve once');
      expect(output).toContain('a=auto-approve');
      expect(output).toContain('n=deny');
    });

    it('should keep strict mode if already enabled', () => {
      mockSession.autoApproveTools = false;
      mockSession.autoApproveOutsideWorkspace = false;
      handleAskCommand([], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should reset both flags to false', () => {
      mockSession.autoApproveTools = true;
      mockSession.autoApproveOutsideWorkspace = false;
      handleAskCommand([], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });
  });

  describe('/ask on', () => {
    it('should enable strict mode', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand(['on'], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should be same as no args', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand([], mockSession);
      const state1 = { ...mockSession };

      mockSession.autoApproveTools = true;
      handleAskCommand(['on'], mockSession);
      const state2 = { ...mockSession };

      expect(state1.autoApproveTools).toBe(state2.autoApproveTools);
      expect(state1.autoApproveOutsideWorkspace).toBe(state2.autoApproveOutsideWorkspace);
    });

    it('should show strict mode message', () => {
      handleAskCommand(['on'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Strict mode');
    });
  });

  describe('/ask off', () => {
    it('should disable strict mode', () => {
      mockSession.autoApproveTools = false;
      mockSession.autoApproveOutsideWorkspace = false;
      handleAskCommand(['off'], mockSession);

      expect(mockSession.autoApproveTools).toBe(true);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(true);
    });

    it('should show warning message', () => {
      handleAskCommand(['off'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Auto-approve');
      expect(output).toContain('ALL tools');
    });

    it('should show how to re-enable', () => {
      handleAskCommand(['off'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('/ask');
    });

    it('should set both flags to true', () => {
      mockSession.autoApproveTools = false;
      mockSession.autoApproveOutsideWorkspace = true;
      handleAskCommand(['off'], mockSession);

      expect(mockSession.autoApproveTools).toBe(true);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(true);
    });
  });

  describe('unknown subcommand', () => {
    it('should show error for unknown option', () => {
      handleAskCommand(['unknown'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });

    it('should show usage hint', () => {
      handleAskCommand(['invalid'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Usage');
      expect(output).toContain('on|off');
    });

    it('should not change session state', () => {
      mockSession.autoApproveTools = false;
      mockSession.autoApproveOutsideWorkspace = false;

      handleAskCommand(['xyz'], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should handle empty string subcommand', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand([''], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should handle numeric subcommand', () => {
      handleAskCommand(['123'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });

    it('should handle special characters', () => {
      handleAskCommand(['@#$'], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });
  });

  describe('case sensitivity', () => {
    it('should accept uppercase ON', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand(['ON'], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should accept uppercase OFF', () => {
      mockSession.autoApproveTools = false;
      handleAskCommand(['OFF'], mockSession);

      expect(mockSession.autoApproveTools).toBe(true);
    });

    it('should accept mixed case', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand(['On'], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);

      handleAskCommand(['oFf'], mockSession);

      expect(mockSession.autoApproveTools).toBe(true);
    });
  });

  describe('integration with /auto', () => {
    it('/ask should be opposite of /auto', () => {
      // /auto toggles auto-approve
      mockSession.autoApproveTools = false;
      mockSession.autoApproveOutsideWorkspace = false;

      // /ask off enables auto-approve (same as /auto)
      handleAskCommand(['off'], mockSession);

      expect(mockSession.autoApproveTools).toBe(true);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(true);

      // /ask disables auto-approve (opposite of /auto)
      handleAskCommand([], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
      expect(mockSession.autoApproveOutsideWorkspace).toBe(false);
    });

    it('should toggle between strict and auto', () => {
      // Start with auto mode
      mockSession.autoApproveTools = true;
      mockSession.autoApproveOutsideWorkspace = true;

      // Toggle to strict
      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);

      // Toggle to auto
      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);

      // Toggle to strict again
      handleAskCommand(['on'], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle extra args', () => {
      handleAskCommand(['on', 'extra', 'args'], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should handle whitespace in subcommand', () => {
      handleAskCommand([' on '], mockSession);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Unknown option');
    });

    it('should handle empty array', () => {
      mockSession.autoApproveTools = true;
      handleAskCommand([], mockSession);

      expect(mockSession.autoApproveTools).toBe(false);
    });
  });

  describe('multiple calls', () => {
    it('should remain in strict mode after multiple /ask calls', () => {
      mockSession.autoApproveTools = true;

      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);

      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);

      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });

    it('should remain in auto mode after multiple /ask off calls', () => {
      mockSession.autoApproveTools = false;

      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);

      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);
    });

    it('should toggle correctly', () => {
      mockSession.autoApproveTools = false;

      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);

      handleAskCommand(['on'], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);

      handleAskCommand(['off'], mockSession);
      expect(mockSession.autoApproveTools).toBe(true);

      handleAskCommand([], mockSession);
      expect(mockSession.autoApproveTools).toBe(false);
    });
  });
});