import { describe, it, expect, beforeEach } from 'vitest';
import { InputQueueManager } from '../../../src/repl/input-queue.js';

describe('InputQueueManager', () => {
  let queue: InputQueueManager;

  beforeEach(() => {
    queue = new InputQueueManager();
  });

  describe('startStreaming / endStreaming', () => {
    it('should start streaming and create AbortController', () => {
      const controller = queue.startStreaming();
      expect(controller).toBeInstanceOf(AbortController);
      expect(queue.isStreaming()).toBe(true);
    });

    it('should end streaming and clear AbortController', () => {
      queue.startStreaming();
      queue.endStreaming();
      expect(queue.isStreaming()).toBe(false);
      expect(queue.getAbortController()).toBeNull();
    });

    it('should create new AbortController on each startStreaming call', () => {
      const controller1 = queue.startStreaming();
      queue.endStreaming();
      const controller2 = queue.startStreaming();
      expect(controller1).not.toBe(controller2);
    });
  });

  describe('queueInput', () => {
    it('should return true and queue input when streaming', () => {
      queue.startStreaming();
      const result = queue.queueInput('test message');
      expect(result).toBe(true);
      expect(queue.getPendingCount()).toBe(1);
    });

    it('should return false when not streaming', () => {
      const result = queue.queueInput('test message');
      expect(result).toBe(false);
      expect(queue.getPendingCount()).toBe(0);
    });

    it('should not queue empty input', () => {
      queue.startStreaming();
      const result = queue.queueInput('');
      expect(result).toBe(false);
      expect(queue.getPendingCount()).toBe(0);
    });

    it('should not queue whitespace-only input', () => {
      queue.startStreaming();
      const result = queue.queueInput('   ');
      expect(result).toBe(false);
      expect(queue.getPendingCount()).toBe(0);
    });

    it('should trim input before queuing', () => {
      queue.startStreaming();
      queue.queueInput('  test message  ');
      const inputs = queue.getPendingInputs();
      expect(inputs[0]).toBe('test message');
    });

    it('should queue multiple inputs', () => {
      queue.startStreaming();
      queue.queueInput('message 1');
      queue.queueInput('message 2');
      queue.queueInput('message 3');
      expect(queue.getPendingCount()).toBe(3);
    });
  });

  describe('getPendingInputs', () => {
    it('should return all queued inputs', () => {
      queue.startStreaming();
      queue.queueInput('msg1');
      queue.queueInput('msg2');
      const inputs = queue.getPendingInputs();
      expect(inputs).toEqual(['msg1', 'msg2']);
    });

    it('should clear queue after retrieval', () => {
      queue.startStreaming();
      queue.queueInput('msg1');
      queue.queueInput('msg2');
      queue.getPendingInputs();
      expect(queue.getPendingInputs()).toEqual([]);
    });

    it('should return empty array when no inputs', () => {
      const inputs = queue.getPendingInputs();
      expect(inputs).toEqual([]);
    });
  });

  describe('abortStream', () => {
    it('should abort the stream and return true', () => {
      queue.startStreaming();
      const result = queue.abortStream();
      expect(result).toBe(true);
      expect(queue.wasAborted()).toBe(true);
    });

    it('should return false when no active stream', () => {
      const result = queue.abortStream();
      expect(result).toBe(false);
    });

    it('should return false on second abort call', () => {
      queue.startStreaming();
      queue.abortStream();
      const result = queue.abortStream();
      expect(result).toBe(false);
    });
  });

  describe('clearPendingInputs', () => {
    it('should clear all pending inputs', () => {
      queue.startStreaming();
      queue.queueInput('msg1');
      queue.queueInput('msg2');
      queue.clearPendingInputs();
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe('getPendingCount', () => {
    it('should return correct count', () => {
      queue.startStreaming();
      expect(queue.getPendingCount()).toBe(0);
      queue.queueInput('msg1');
      expect(queue.getPendingCount()).toBe(1);
      queue.queueInput('msg2');
      expect(queue.getPendingCount()).toBe(2);
    });
  });
});