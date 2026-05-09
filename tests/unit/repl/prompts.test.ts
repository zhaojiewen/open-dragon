import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  promptWorkspaceInit,
  promptToolConfirm,
  promptOutsideWorkspace,
} from '../../../src/repl/prompts.js';

// Mock chalk to return plain strings
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

describe('prompts', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let mockStdin: {
    isRaw: boolean;
    setRawMode: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  let originalStdin: typeof process.stdin;
  let capturedListeners: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedListeners = new Map();

    // Create mock stdin with all required methods
    mockStdin = {
      isRaw: false,
      setRawMode: vi.fn().mockImplementation((mode: boolean) => {
        mockStdin.isRaw = mode;
        return mockStdin;
      }),
      resume: vi.fn().mockReturnThis(),
      pause: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation((event: string, listener: Function) => {
        capturedListeners.set(event, listener);
        return mockStdin;
      }),
      once: vi.fn().mockImplementation((event: string, listener: Function) => {
        capturedListeners.set(event, listener);
        return mockStdin;
      }),
      removeListener: vi.fn().mockReturnThis(),
    };

    // Replace process.stdin with mock
    originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    // Mock stdout.write
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    // Restore original stdin
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  // Helper to simulate key press
  const simulateKeyPress = (key: string) => {
    const dataListener = capturedListeners.get('data');
    if (dataListener) {
      dataListener(Buffer.from(key));
    }
  };

  // Helper to simulate close event
  const simulateClose = () => {
    const closeListener = capturedListeners.get('close');
    if (closeListener) {
      closeListener();
    }
  };

  describe('promptWorkspaceInit', () => {
    it('should return true when user presses "y"', async () => {
      const promise = promptWorkspaceInit('/test/workspace');
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should return false when user presses "n"', async () => {
      const promise = promptWorkspaceInit('/test/workspace');
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should handle uppercase "Y"', async () => {
      const promise = promptWorkspaceInit('/test/workspace');
      simulateKeyPress('Y');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should handle uppercase "N"', async () => {
      const promise = promptWorkspaceInit('/test/workspace');
      simulateKeyPress('N');
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should ignore invalid keys and wait for y/n', async () => {
      const promise = promptWorkspaceInit('/test/workspace');

      // Simulate pressing invalid keys first
      simulateKeyPress('x');
      simulateKeyPress('1');
      simulateKeyPress(' ');
      simulateKeyPress('\n');

      // Then press valid key
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should display workspace path in prompt', async () => {
      const promise = promptWorkspaceInit('/my/custom/path');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('/my/custom/path');
    });

    it('should call setRawMode with true', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
    });

    it('should resume stdin', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.resume).toHaveBeenCalled();
    });

    it('should pause stdin after response', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should restore raw mode state after response', async () => {
      // Simulate stdin was already in raw mode
      mockStdin.isRaw = true;

      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      // Should restore to previous raw mode state (true)
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(true);
    });

    it('should restore raw mode to false when stdin was not in raw mode', async () => {
      // Simulate stdin was not in raw mode
      mockStdin.isRaw = false;

      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      // Second call should restore to false
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('should remove data listener after response', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should remove close listener after response', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.removeListener).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should write the key pressed to stdout', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      // Find the call that contains just the key
      const writes = stdoutWriteSpy.mock.calls.map(c => c[0]);
      expect(writes).toContain('y\n');
    });

    it('should write "n\\n" when pressing n', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('n');
      await promise;

      const writes = stdoutWriteSpy.mock.calls.map(c => c[0]);
      expect(writes).toContain('n\n');
    });

    it('should handle key with whitespace (trim)', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress(' y ');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should handle key with newline (trim)', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('\ny\n');
      simulateKeyPress('y'); // Need to press valid key
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should register data listener', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should register close listener', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('promptToolConfirm', () => {
    it('should return "approve-once" when user presses "y"', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should return "approve-all-session" when user presses "a"', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('a');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });

    it('should return "deny-all" when user presses "n"', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should handle uppercase keys', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('Y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should handle uppercase "A"', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('A');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });

    it('should handle uppercase "N"', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('N');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should display only dangerous count when safeCount is 0', async () => {
      const promise = promptToolConfirm(3, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('3 dangerous tool(s) pending');
      expect(output).not.toContain('safe');
    });

    it('should display both counts when safeCount > 0', async () => {
      const promise = promptToolConfirm(2, 5);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('2 dangerous tool(s) + 5 safe tool(s) pending');
    });

    it('should display correct count for single dangerous tool', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('1 dangerous tool(s) pending');
    });

    it('should display correct counts for multiple tools', async () => {
      const promise = promptToolConfirm(10, 25);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('10 dangerous tool(s) + 25 safe tool(s) pending');
    });

    it('should ignore invalid keys', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('x');
      simulateKeyPress('b');
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should call setRawMode with true', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
    });

    it('should resume stdin', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.resume).toHaveBeenCalled();
    });

    it('should pause stdin after response', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should remove listeners after response', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.removeListener).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should write the key pressed to stdout', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('a');
      await promise;

      const writes = stdoutWriteSpy.mock.calls.map(c => c[0]);
      expect(writes).toContain('a\n');
    });

    it('should restore raw mode state', async () => {
      mockStdin.isRaw = false;

      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('should handle zero dangerous tools (edge case)', async () => {
      const promise = promptToolConfirm(0, 0);
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should handle large numbers', async () => {
      const promise = promptToolConfirm(1000, 5000);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('1000 dangerous tool(s) + 5000 safe tool(s) pending');
    });

    it('should register data listener', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should register close listener', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should restore raw mode when wasRaw is true', async () => {
      mockStdin.isRaw = true;

      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      // Should restore to true (the original state)
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(true);
    });
  });

  describe('promptOutsideWorkspace', () => {
    it('should return "approve-once" when user presses "y"', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should return "approve-all-session" when user presses "a"', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('a');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });

    it('should return "deny-all" when user presses "n"', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should handle uppercase keys', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('Y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should handle uppercase "A"', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('A');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });

    it('should handle uppercase "N"', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('N');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should display only outside count when insideCount is 0', async () => {
      const promise = promptOutsideWorkspace(3, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('3 tool(s) outside workspace');
      expect(output).not.toContain('inside');
    });

    it('should display both counts when insideCount > 0', async () => {
      const promise = promptOutsideWorkspace(2, 5);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('2 tool(s) outside workspace + 5 inside');
    });

    it('should display correct count for single outside tool', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('1 tool(s) outside workspace');
    });

    it('should display correct counts for multiple tools', async () => {
      const promise = promptOutsideWorkspace(10, 25);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('10 tool(s) outside workspace + 25 inside');
    });

    it('should ignore invalid keys', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('x');
      simulateKeyPress('b');
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('should call setRawMode with true', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
    });

    it('should resume stdin', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.resume).toHaveBeenCalled();
    });

    it('should pause stdin after response', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should remove listeners after response', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStdin.removeListener).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should write the key pressed to stdout', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('a');
      await promise;

      const writes = stdoutWriteSpy.mock.calls.map(c => c[0]);
      expect(writes).toContain('a\n');
    });

    it('should restore raw mode state', async () => {
      mockStdin.isRaw = false;

      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('should handle zero outside tools (edge case)', async () => {
      const promise = promptOutsideWorkspace(0, 0);
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('should handle large numbers', async () => {
      const promise = promptOutsideWorkspace(1000, 5000);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('1000 tool(s) outside workspace + 5000 inside');
    });

    it('should display default message about auth', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Default: require auth for out-of-workspace access');
    });

    it('should display auto-approve option text', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('auto-approve out-of-workspace');
    });

    it('should register data listener', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should register close listener', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('stdin close event handler', () => {
    it('promptWorkspaceInit should register close handler', async () => {
      const promise = promptWorkspaceInit('/test');

      // Verify once was called for close event
      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));

      // Complete the promise
      simulateKeyPress('y');
      await promise;
    });

    it('promptToolConfirm should register close handler', async () => {
      const promise = promptToolConfirm(1, 0);

      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));

      simulateKeyPress('y');
      await promise;
    });

    it('promptOutsideWorkspace should register close handler', async () => {
      const promise = promptOutsideWorkspace(1, 0);

      expect(mockStdin.once).toHaveBeenCalledWith('close', expect.any(Function));

      simulateKeyPress('y');
      await promise;
    });

    it('close handler should cleanup stdin state', async () => {
      const promise = promptWorkspaceInit('/test');

      // Simulate close event
      simulateClose();

      // Cleanup should have been called
      expect(mockStdin.pause).toHaveBeenCalled();
      expect(mockStdin.removeListener).toHaveBeenCalled();
    });

    it('close handler should restore raw mode', async () => {
      mockStdin.isRaw = true;

      const promise = promptWorkspaceInit('/test');

      // Simulate close event
      simulateClose();

      // Should restore raw mode
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(true);
    });
  });

  describe('multiple key presses before valid key', () => {
    it('promptWorkspaceInit should handle rapid key presses', async () => {
      const promise = promptWorkspaceInit('/test');

      // Simulate rapid key presses
      simulateKeyPress('x');
      simulateKeyPress('q');
      simulateKeyPress('1');
      simulateKeyPress('y');

      const result = await promise;
      expect(result).toBe(true);
    });

    it('promptToolConfirm should handle rapid key presses', async () => {
      const promise = promptToolConfirm(1, 0);

      simulateKeyPress('z');
      simulateKeyPress('b');
      simulateKeyPress('c');
      simulateKeyPress('a');

      const result = await promise;
      expect(result).toBe('approve-all-session');
    });

    it('promptOutsideWorkspace should handle rapid key presses', async () => {
      const promise = promptOutsideWorkspace(1, 0);

      simulateKeyPress('m');
      simulateKeyPress('p');
      simulateKeyPress('n');

      const result = await promise;
      expect(result).toBe('deny-all');
    });
  });

  describe('whitespace in key input', () => {
    it('promptWorkspaceInit should trim whitespace', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('  y  ');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('promptToolConfirm should trim whitespace', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('  y  ');
      const result = await promise;

      expect(result).toBe('approve-once');
    });

    it('promptOutsideWorkspace should trim whitespace', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('\ta\n');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });
  });

  describe('edge cases with counts', () => {
    it('promptToolConfirm with zero dangerous and non-zero safe', async () => {
      const promise = promptToolConfirm(0, 5);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('0 dangerous tool(s) + 5 safe tool(s) pending');
    });

    it('promptOutsideWorkspace with zero outside and non-zero inside', async () => {
      const promise = promptOutsideWorkspace(0, 5);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('0 tool(s) outside workspace + 5 inside');
    });

    it('promptToolConfirm with same dangerous and safe counts', async () => {
      const promise = promptToolConfirm(3, 3);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('3 dangerous tool(s) + 3 safe tool(s) pending');
    });

    it('promptOutsideWorkspace with same outside and inside counts', async () => {
      const promise = promptOutsideWorkspace(3, 3);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('3 tool(s) outside workspace + 3 inside');
    });
  });

  describe('prompt formatting', () => {
    it('promptWorkspaceInit should show [y] and [n] options', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('[y]');
      expect(output).toContain('[n]');
      expect(output).toContain('yes');
      expect(output).toContain('no');
    });

    it('promptToolConfirm should show [y], [a], [n] options', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('[y]');
      expect(output).toContain('[a]');
      expect(output).toContain('[n]');
      expect(output).toContain('approve');
      expect(output).toContain('deny');
    });

    it('promptOutsideWorkspace should show [y], [a], [n] options', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('[y]');
      expect(output).toContain('[a]');
      expect(output).toContain('[n]');
      expect(output).toContain('allow once');
      expect(output).toContain('deny');
    });

    it('promptWorkspaceInit should show Choice: prompt', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Choice:');
    });

    it('promptToolConfirm should show Choice: prompt', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Choice:');
    });

    it('promptOutsideWorkspace should show Choice: prompt', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Choice:');
    });

    it('promptWorkspaceInit should show workspace confirmation question', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Use current directory as workspace?');
    });
  });

  describe('special paths', () => {
    it('promptWorkspaceInit should handle paths with spaces', async () => {
      const promise = promptWorkspaceInit('/path/with spaces/dir');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('/path/with spaces/dir');
    });

    it('promptWorkspaceInit should handle paths with unicode', async () => {
      const promise = promptWorkspaceInit('/path/日本語/路径');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('/path/日本語/路径');
    });

    it('promptWorkspaceInit should handle empty path (edge case)', async () => {
      const promise = promptWorkspaceInit('');
      simulateKeyPress('y');
      await promise;

      // Should still work with empty path
      expect(stdoutWriteSpy).toHaveBeenCalled();
    });

    it('promptWorkspaceInit should handle very long paths', async () => {
      const longPath = '/a'.repeat(100);
      const promise = promptWorkspaceInit(longPath);
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain(longPath);
    });

    it('promptWorkspaceInit should handle home directory path', async () => {
      const promise = promptWorkspaceInit('~');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('~');
    });

    it('promptWorkspaceInit should handle relative path', async () => {
      const promise = promptWorkspaceInit('./relative/path');
      simulateKeyPress('y');
      await promise;

      const output = stdoutWriteSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('./relative/path');
    });
  });

  describe('raw mode state restoration', () => {
    it('promptWorkspaceInit should restore raw mode even when stdin.isRaw is undefined', async () => {
      // Set isRaw to undefined (edge case)
      mockStdin.isRaw = undefined as any;

      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      await promise;

      // Should default to false when isRaw is undefined
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('promptToolConfirm should restore raw mode even when stdin.isRaw is undefined', async () => {
      mockStdin.isRaw = undefined as any;

      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('promptOutsideWorkspace should restore raw mode even when stdin.isRaw is undefined', async () => {
      mockStdin.isRaw = undefined as any;

      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('promptWorkspaceInit should correctly restore when wasRaw is true', async () => {
      mockStdin.isRaw = true;

      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('n');
      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true); // Initial call
      expect(mockStdin.setRawMode).toHaveBeenLastCalledWith(true); // Restore to original
    });
  });

  describe('sequential prompt usage', () => {
    it('should handle multiple sequential workspace prompts', async () => {
      // First prompt
      let promise = promptWorkspaceInit('/path1');
      simulateKeyPress('y');
      let result = await promise;
      expect(result).toBe(true);

      // Reset captured listeners
      capturedListeners.clear();
      vi.clearAllMocks();

      // Second prompt
      promise = promptWorkspaceInit('/path2');
      simulateKeyPress('n');
      result = await promise;
      expect(result).toBe(false);
    });

    it('should handle multiple sequential tool confirm prompts', async () => {
      let promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      let result = await promise;
      expect(result).toBe('approve-once');

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptToolConfirm(2, 3);
      simulateKeyPress('a');
      result = await promise;
      expect(result).toBe('approve-all-session');

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptToolConfirm(5, 0);
      simulateKeyPress('n');
      result = await promise;
      expect(result).toBe('deny-all');
    });

    it('should handle multiple sequential outside workspace prompts', async () => {
      let promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      let result = await promise;
      expect(result).toBe('approve-once');

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptOutsideWorkspace(2, 3);
      simulateKeyPress('a');
      result = await promise;
      expect(result).toBe('approve-all-session');

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptOutsideWorkspace(5, 0);
      simulateKeyPress('n');
      result = await promise;
      expect(result).toBe('deny-all');
    });

    it('should handle alternating prompt types', async () => {
      let promise = promptWorkspaceInit('/test');
      simulateKeyPress('y');
      let result1 = await promise;
      expect(result1).toBe(true);

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptToolConfirm(1, 0);
      simulateKeyPress('n');
      let result2 = await promise;
      expect(result2).toBe('deny-all');

      capturedListeners.clear();
      vi.clearAllMocks();

      promise = promptOutsideWorkspace(2, 1);
      simulateKeyPress('a');
      let result3 = await promise;
      expect(result3).toBe('approve-all-session');
    });
  });

  describe('all three return values for each prompt type', () => {
    it('promptToolConfirm should handle all three outcomes', async () => {
      // Test y
      capturedListeners.clear();
      vi.clearAllMocks();
      let promise = promptToolConfirm(1, 0);
      simulateKeyPress('y');
      expect(await promise).toBe('approve-once');

      // Test a
      capturedListeners.clear();
      vi.clearAllMocks();
      promise = promptToolConfirm(1, 0);
      simulateKeyPress('a');
      expect(await promise).toBe('approve-all-session');

      // Test n
      capturedListeners.clear();
      vi.clearAllMocks();
      promise = promptToolConfirm(1, 0);
      simulateKeyPress('n');
      expect(await promise).toBe('deny-all');
    });

    it('promptOutsideWorkspace should handle all three outcomes', async () => {
      // Test y
      capturedListeners.clear();
      vi.clearAllMocks();
      let promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('y');
      expect(await promise).toBe('approve-once');

      // Test a
      capturedListeners.clear();
      vi.clearAllMocks();
      promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('a');
      expect(await promise).toBe('approve-all-session');

      // Test n
      capturedListeners.clear();
      vi.clearAllMocks();
      promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('n');
      expect(await promise).toBe('deny-all');
    });
  });

  describe('empty Buffer handling', () => {
    it('promptWorkspaceInit should handle empty Buffer', async () => {
      const promise = promptWorkspaceInit('/test');
      simulateKeyPress('');
      simulateKeyPress('y');
      const result = await promise;

      expect(result).toBe(true);
    });

    it('promptToolConfirm should handle empty Buffer', async () => {
      const promise = promptToolConfirm(1, 0);
      simulateKeyPress('');
      simulateKeyPress('n');
      const result = await promise;

      expect(result).toBe('deny-all');
    });

    it('promptOutsideWorkspace should handle empty Buffer', async () => {
      const promise = promptOutsideWorkspace(1, 0);
      simulateKeyPress('');
      simulateKeyPress('a');
      const result = await promise;

      expect(result).toBe('approve-all-session');
    });
  });
});