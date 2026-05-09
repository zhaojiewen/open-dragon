/**
 * Input Queue Manager for concurrent input during AI streaming
 *
 * Allows users to type messages while AI is streaming responses.
 * Queued inputs are processed sequentially after the current response completes.
 */

export interface InputQueueState {
  pendingInputs: string[];
  isStreaming: boolean;
  streamAbortController: AbortController | null;
}

export class InputQueueManager {
  private state: InputQueueState = {
    pendingInputs: [],
    isStreaming: false,
    streamAbortController: null,
  };

  /**
   * Signal that streaming has started
   * Creates a new AbortController for cancellation support
   */
  startStreaming(): AbortController {
    this.state.isStreaming = true;
    this.state.streamAbortController = new AbortController();
    return this.state.streamAbortController;
  }

  /**
   * Signal that streaming has ended
   * Clears the AbortController
   */
  endStreaming(): void {
    this.state.isStreaming = false;
    this.state.streamAbortController = null;
  }

  /**
   * Queue an input for later processing
   * Returns true if input was queued (streaming), false if not streaming
   */
  queueInput(text: string): boolean {
    if (!text.trim()) {
      return false; // Don't queue empty input
    }

    if (this.state.isStreaming) {
      this.state.pendingInputs.push(text.trim());
      return true;
    }
    return false;
  }

  /**
   * Get all pending inputs and clear the queue
   */
  getPendingInputs(): string[] {
    const inputs = [...this.state.pendingInputs];
    this.state.pendingInputs = [];
    return inputs;
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.state.isStreaming;
  }

  /**
   * Get the current AbortController
   */
  getAbortController(): AbortController | null {
    return this.state.streamAbortController;
  }

  /**
   * Abort the current stream
   * Returns true if abort was triggered, false if no active stream
   */
  abortStream(): boolean {
    if (this.state.streamAbortController && !this.state.streamAbortController.signal.aborted) {
      this.state.streamAbortController.abort();
      return true;
    }
    return false;
  }

  /**
   * Check if the stream was aborted
   */
  wasAborted(): boolean {
    return this.state.streamAbortController?.signal.aborted ?? false;
  }

  /**
   * Get count of pending inputs
   */
  getPendingCount(): number {
    return this.state.pendingInputs.length;
  }

  /**
   * Clear all pending inputs without returning them
   */
  clearPendingInputs(): void {
    this.state.pendingInputs = [];
  }
}