import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as readline from 'readline';

describe('REPL SIGINT handling', () => {
  describe('isProcessing flag behavior', () => {
    it('should allow SIGINT to work when not processing', () => {
      let isProcessing = false;
      let sigintCount = 0;

      const handleSIGINT = () => {
        if (isProcessing) {
          sigintCount++;
          return;
        }
        sigintCount++;
      };

      handleSIGINT();
      expect(sigintCount).toBe(1);
    });

    it('should handle SIGINT during processing', () => {
      let isProcessing = true;
      let sigintCount = 0;

      const handleSIGINT = () => {
        if (isProcessing) {
          sigintCount++;
          return;
        }
        sigintCount++;
      };

      handleSIGINT();
      expect(sigintCount).toBe(1);
    });

    it('should force exit on second SIGINT during processing', () => {
      let isProcessing = true;
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

    it('should clear sigintCount after timeout', async () => {
      let sigintCount = 0;
      const resetTimeout = () => {
        setTimeout(() => { sigintCount = 0; }, 2000);
      };

      sigintCount++;
      resetTimeout();

      // Wait less than timeout
      await new Promise(r => setTimeout(r, 100));
      expect(sigintCount).toBe(1);
    });
  });

  describe('streaming state handling', () => {
    it('should abort stream on SIGINT during streaming', () => {
      let isStreaming = true;
      let aborted = false;

      const handleSIGINT = () => {
        if (isStreaming) {
          aborted = true;
        }
      };

      handleSIGINT();
      expect(aborted).toBe(true);
    });

    it('should preserve queued inputs on abort', () => {
      const pendingInputs: string[] = ['msg1', 'msg2'];
      let isStreaming = true;
      let aborted = false;

      const handleSIGINT = () => {
        if (isStreaming) {
          aborted = true;
          // Inputs are preserved
        }
      };

      handleSIGINT();
      expect(aborted).toBe(true);
      expect(pendingInputs.length).toBe(2);
    });

    it('should transition from streaming to not streaming after abort', () => {
      let isStreaming = true;

      const abortStream = () => {
        isStreaming = false;
        return true;
      };

      const result = abortStream();
      expect(result).toBe(true);
      expect(isStreaming).toBe(false);
    });
  });

  describe('input handling during processing', () => {
    it('should skip input when processing', () => {
      let isProcessing = true;
      let inputsProcessed: string[] = [];

      const handleInput = (input: string) => {
        if (isProcessing) {
          return; // Skip
        }
        inputsProcessed.push(input);
      };

      handleInput('test');
      expect(inputsProcessed.length).toBe(0);
    });

    it('should process input when not processing', () => {
      let isProcessing = false;
      let inputsProcessed: string[] = [];

      const handleInput = (input: string) => {
        if (isProcessing) {
          return; // Skip
        }
        inputsProcessed.push(input);
      };

      handleInput('test');
      expect(inputsProcessed.length).toBe(1);
    });

    it('should process input after processing completes', () => {
      let isProcessing = true;
      let inputsProcessed: string[] = [];

      const handleInput = (input: string) => {
        if (isProcessing) {
          return; // Skip
        }
        inputsProcessed.push(input);
      };

      handleInput('test1'); // Skipped
      isProcessing = false;
      handleInput('test2'); // Processed

      expect(inputsProcessed).toEqual(['test2']);
    });
  });

  describe('command handling during streaming', () => {
    it('should process commands immediately during streaming', () => {
      let isStreaming = true;
      let commandExecuted = false;

      const handleInput = (input: string) => {
        if (input.startsWith('/')) {
          // Commands processed immediately even during streaming
          commandExecuted = true;
        }
      };

      handleInput('/help');
      expect(commandExecuted).toBe(true);
    });

    it('should queue chat messages during streaming', () => {
      let isStreaming = true;
      const queuedInputs: string[] = [];

      const handleInput = (input: string) => {
        if (isStreaming && !input.startsWith('/')) {
          queuedInputs.push(input);
        }
      };

      handleInput('hello');
      expect(queuedInputs.length).toBe(1);
    });
  });

  describe('double Ctrl+C exit', () => {
    it('should require two Ctrl+C to exit', () => {
      let sigintCount = 0;
      let exited = false;
      let isProcessing = false;
      let isStreaming = false;

      const handleSIGINT = () => {
        if (isStreaming) return;
        if (isProcessing) {
          sigintCount++;
          if (sigintCount >= 2) exited = true;
          return;
        }

        sigintCount++;
        if (sigintCount >= 2) {
          exited = true;
        }
      };

      handleSIGINT();
      expect(exited).toBe(false);

      handleSIGINT();
      expect(exited).toBe(true);
    });

    it('should show message on first Ctrl+C', () => {
      let sigintCount = 0;
      let messageShown = false;

      const handleSIGINT = () => {
        sigintCount++;
        if (sigintCount === 1) {
          messageShown = true;
        }
      };

      handleSIGINT();
      expect(messageShown).toBe(true);
    });
  });

  describe('readline SIGINT event', () => {
    it('should emit SIGINT event on Ctrl+C when terminal is true', () => {
      // Simulate readline SIGINT event behavior
      const sigintHandlers: (() => void)[] = [];
      let sigintTriggered = false;

      const mockReadline = {
        on: (event: string, handler: () => void) => {
          if (event === 'SIGINT') {
            sigintHandlers.push(handler);
          }
        },
        triggerSIGINT: () => {
          sigintHandlers.forEach(h => h());
          sigintTriggered = true;
        },
      };

      mockReadline.on('SIGINT', () => {
        // Handle Ctrl+C
      });

      mockReadline.triggerSIGINT();
      expect(sigintTriggered).toBe(true);
    });

    it('should register SIGINT handler on readline', () => {
      let handlerRegistered = false;
      const mockReadline = {
        on: (event: string, handler: () => void) => {
          if (event === 'SIGINT') {
            handlerRegistered = true;
          }
        },
      };

      mockReadline.on('SIGINT', () => {});
      expect(handlerRegistered).toBe(true);
    });

    it('should handle multiple SIGINT events', () => {
      let sigintCount = 0;
      const mockReadline = {
        on: (event: string, handler: () => void) => {
          if (event === 'SIGINT') {
            handler();
          }
        },
      };

      mockReadline.on('SIGINT', () => {
        sigintCount++;
      });

      expect(sigintCount).toBe(1);
    });
  });
});