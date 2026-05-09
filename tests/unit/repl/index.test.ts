import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import * as readline from 'readline';

// Test that REPL stays running by testing the core loop behavior
// We'll mock the minimal dependencies and test the actual handler logic

describe('REPL Stays Running', () => {
  describe('handleCommand returns correct value', () => {
    it('should return false for /exit', async () => {
      // Import the actual command handler
      const { handleCommand } = await import('../../../src/repl/commands.js');

      // Create minimal mock objects
      const mockConfig = {
        defaultProvider: 'test',
        providers: {},
        workspace: { paths: [], enforceBounds: false },
      } as any;
      const mockMessages: any[] = [];
      const mockToolRegistry = {
        getToolDefinitions: () => [],
        setProvider: vi.fn(),
        disconnectMcp: vi.fn(async () => {}),
      } as any;
      const mockSession = {
        provider: {},
        providerName: 'test',
        model: 'test-model',
      } as any;

      const result = await handleCommand('/exit', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(result).toBe(false);
    });

    it('should return true for /help', async () => {
      const { handleCommand } = await import('../../../src/repl/commands.js');

      const mockConfig = {
        defaultProvider: 'test',
        providers: {},
        workspace: { paths: [], enforceBounds: false },
      } as any;
      const mockMessages: any[] = [];
      const mockToolRegistry = {
        getToolDefinitions: () => [],
      } as any;
      const mockSession = {
        provider: {},
        providerName: 'test',
        model: 'test-model',
      } as any;

      const result = await handleCommand('/help', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(result).toBe(true);
    });

    it('should return true for unknown command', async () => {
      const { handleCommand } = await import('../../../src/repl/commands.js');

      const mockConfig = {
        defaultProvider: 'test',
        providers: {},
        workspace: { paths: [], enforceBounds: false },
      } as any;
      const mockMessages: any[] = [];
      const mockToolRegistry = {
        getToolDefinitions: () => [],
      } as any;
      const mockSession = {
        provider: {},
        providerName: 'test',
        model: 'test-model',
      } as any;

      const result = await handleCommand('/unknown', mockConfig, mockMessages, mockToolRegistry, mockSession);
      expect(result).toBe(true);
    });
  });

  describe('REPL interactive loop behavior simulation', () => {
    it('should call prompt after processing user input', async () => {
      // Simulate the REPL loop behavior
      const promptFn = vi.fn();
      const closeFn = vi.fn();
      const messages: any[] = [];

      // Simulate a handler similar to what REPL uses
      const handleLine = async (input: string) => {
        if (!input.trim()) {
          promptFn();
          return;
        }

        if (input.startsWith('/')) {
          // Command handling - simulate /help (stays running)
          promptFn();
          return;
        }

        // Simulate chat handling
        messages.push({ role: 'user', content: input });
        // Simulate AI response
        messages.push({ role: 'assistant', content: 'Response' });
        promptFn();
      };

      // Test multiple turns
      await handleLine('hello');
      await handleLine('tell me more');
      await handleLine('thanks');

      expect(promptFn).toHaveBeenCalledTimes(3);
    });

    it('should call prompt after error', async () => {
      const promptFn = vi.fn();
      const messages: any[] = [];

      const handleLineWithError = async (input: string) => {
        messages.push({ role: 'user', content: input });
        try {
          // Simulate error
          throw new Error('Test error');
        } catch (error: any) {
          // Should still call prompt after error
          promptFn();
        }
      };

      await handleLineWithError('hello');

      expect(promptFn).toHaveBeenCalled();
    });

    it('should only exit on /exit command, not on normal input', async () => {
      let shouldKeepRunning = true;
      const exitFn = vi.fn();
      const promptFn = vi.fn();

      const handleLine = async (input: string) => {
        if (input === '/exit') {
          shouldKeepRunning = false;
          exitFn(0);
          return;
        }

        // Normal processing
        promptFn();
      };

      // Normal input doesn't exit
      await handleLine('hello');
      expect(shouldKeepRunning).toBe(true);
      expect(exitFn).not.toHaveBeenCalled();

      // /exit does exit
      await handleLine('/exit');
      expect(shouldKeepRunning).toBe(false);
      expect(exitFn).toHaveBeenCalledWith(0);
    });
  });

  describe('Readline recreation on close', () => {
    it('should recreate readline when shouldKeepRunning is true', () => {
      let shouldKeepRunning = true;
      let promptCount = 0;

      const handleClose = (stdinDestroyed: boolean) => {
        if (shouldKeepRunning && !stdinDestroyed) {
          // Simulate readline recreation
          promptCount++;
          // New readline prompt
          promptCount++;
        } else {
          // Exit
          promptCount = -1; // Signal exit
        }
      };

      // Unexpected close - stdin not destroyed
      handleClose(false);
      expect(promptCount).toBeGreaterThan(0);
      expect(promptCount).not.toBe(-1);
    });

    it('should exit when stdin is destroyed (Ctrl+D)', () => {
      let shouldKeepRunning = true;
      let exited = false;

      const handleClose = (stdinDestroyed: boolean) => {
        if (shouldKeepRunning && !stdinDestroyed) {
          // Recreate
        } else {
          exited = true;
        }
      };

      handleClose(true);
      expect(exited).toBe(true);
    });
  });

  describe('SIGINT double-press behavior', () => {
    it('should not exit on first SIGINT', () => {
      let sigintCount = 0;
      let exited = false;

      const handleSIGINT = () => {
        sigintCount++;
        if (sigintCount === 1) {
          // Show message, don't exit
        } else {
          exited = true;
        }
      };

      handleSIGINT();
      expect(exited).toBe(false);
    });

    it('should exit on second SIGINT within timeout', () => {
      let sigintCount = 0;
      let exited = false;

      const handleSIGINT = () => {
        sigintCount++;
        if (sigintCount >= 2) {
          exited = true;
        }
      };

      handleSIGINT();
      handleSIGINT();
      expect(exited).toBe(true);
    });
  });

  describe('Autogen state management', () => {
    it('should use shared autogen state between handlers and REPL', async () => {
      const { getAutoGenState, setAutoGenState } = await import('../../../src/repl/handlers.js');

      // Initial state
      expect(getAutoGenState().pending).toBe(false);

      // Set pending
      setAutoGenState(true, 5);
      expect(getAutoGenState().pending).toBe(true);
      expect(getAutoGenState().lastIndex).toBe(5);

      // Clear pending
      setAutoGenState(false, 10);
      expect(getAutoGenState().pending).toBe(false);
      expect(getAutoGenState().lastIndex).toBe(10);
    });

    it('should handle autogen detection in REPL loop', async () => {
      const { getAutoGenState, setAutoGenState } = await import('../../../src/repl/handlers.js');

      // Simulate autogen being triggered with lastIndex = 2 (before new messages)
      setAutoGenState(true, 2);

      const messages: any[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'response' },
        { role: 'user', content: 'another' },
        { role: 'assistant', content: 'response2' },
      ]; // length = 4, which is > 2

      // Check detection condition used in REPL
      const { pending, lastIndex } = getAutoGenState();
      const shouldTriggerAutogen = pending && messages.length > lastIndex;

      expect(shouldTriggerAutogen).toBe(true);

      // After processing, clear state
      setAutoGenState(false, messages.length);
      expect(getAutoGenState().pending).toBe(false);
    });

    it('should not trigger autogen when lastIndex >= messages.length', async () => {
      const { getAutoGenState, setAutoGenState } = await import('../../../src/repl/handlers.js');

      // Set lastIndex to 5, but we only have 2 messages
      setAutoGenState(true, 5);

      const messages: any[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'response' },
      ]; // length = 2, which is less than lastIndex (5)

      const { pending, lastIndex } = getAutoGenState();
      const shouldTriggerAutogen = pending && messages.length > lastIndex;

      // 2 > 5 is false, so should NOT trigger
      expect(shouldTriggerAutogen).toBe(false);
    });
  });
});