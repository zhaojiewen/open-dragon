import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPerformanceMonitor, getPerformanceMonitor } from '../../../src/utils/performance.js';

// Mock the logger
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('PerformanceMonitor', () => {
  let monitor: ReturnType<typeof createPerformanceMonitor>;

  beforeEach(() => {
    monitor = createPerformanceMonitor();
    vi.clearAllMocks();
  });

  describe('timer methods', () => {
    it('should start timer', () => {
      expect(() => monitor.startTimer('test-operation')).not.toThrow();
    });

    it('should end timer and return duration', () => {
      monitor.startTimer('test-operation');
      const duration = monitor.endTimer('test-operation');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent timer', () => {
      const duration = monitor.endTimer('non-existent');
      expect(duration).toBeNull();
    });

    it('should track multiple timers', () => {
      monitor.startTimer('timer1');
      monitor.startTimer('timer2');

      const duration1 = monitor.endTimer('timer1');
      const duration2 = monitor.endTimer('timer2');

      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
    });

    it('should handle same timer name twice', () => {
      monitor.startTimer('timer');
      monitor.startTimer('timer'); // Overwrites first

      const duration = monitor.endTimer('timer');
      expect(duration).toBeGreaterThanOrEqual(0);

      // Second end should return null
      const duration2 = monitor.endTimer('timer');
      expect(duration2).toBeNull();
    });
  });

  describe('timeAsync', () => {
    it('should time successful operation', async () => {
      const result = await monitor.timeAsync('test-op', async () => 'success');
      expect(result).toBe('success');
    });

    it('should time failed operation', async () => {
      await expect(
        monitor.timeAsync('test-op', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should pass metadata', async () => {
      await monitor.timeAsync('test-op', async () => 'done', { key: 'value' });
      // Should not throw
    });

    it('should handle async operations with delay', async () => {
      const start = Date.now();
      await monitor.timeAsync('delayed-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('recordToolExecution', () => {
    it('should record successful execution', () => {
      monitor.recordToolExecution('bash', 100, true);
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.totalErrors).toBe(0);
    });

    it('should record failed execution', () => {
      monitor.recordToolExecution('bash', 100, false);
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.totalErrors).toBe(1);
    });

    it('should track multiple executions', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordToolExecution('bash', 200, true);
      monitor.recordToolExecution('read', 50, true);
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(3);
    });

    it('should track executions per tool', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordToolExecution('bash', 200, true);
      monitor.recordToolExecution('read', 50, true);

      const summary = monitor.getSummary();
      expect(summary.toolStats?.bash?.count).toBe(2);
      expect(summary.toolStats?.read?.count).toBe(1);
    });
  });

  describe('recordApiCall', () => {
    it('should record successful API call', () => {
      monitor.recordApiCall('openai', 500, true);
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.totalErrors).toBe(0);
    });

    it('should record failed API call', () => {
      monitor.recordApiCall('anthropic', 300, false);
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.totalErrors).toBe(1);
    });

    it('should track multiple API calls', () => {
      monitor.recordApiCall('openai', 100, true);
      monitor.recordApiCall('openai', 200, true);
      monitor.recordApiCall('anthropic', 150, false);

      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(3);
      expect(summary.totalErrors).toBe(1);
    });

    it('should track calls per provider', () => {
      monitor.recordApiCall('openai', 100, true);
      monitor.recordApiCall('openai', 200, true);
      monitor.recordApiCall('anthropic', 150, true);

      const summary = monitor.getSummary();
      expect(summary.apiStats?.openai?.count).toBe(2);
      expect(summary.apiStats?.anthropic?.count).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty array', () => {
      const stats = monitor.getStats([]);
      expect(stats).toEqual({
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        total: 0,
      });
    });

    it('should calculate stats for values', () => {
      const stats = monitor.getStats([100, 200, 300]);
      expect(stats.count).toBe(3);
      expect(stats.total).toBe(600);
      expect(stats.avg).toBe(200);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
    });

    it('should handle single value', () => {
      const stats = monitor.getStats([150]);
      expect(stats.count).toBe(1);
      expect(stats.avg).toBe(150);
      expect(stats.min).toBe(150);
      expect(stats.max).toBe(150);
    });

    it('should handle decimal values', () => {
      const stats = monitor.getStats([100.5, 200.25, 300.75]);
      expect(stats.count).toBe(3);
      expect(stats.total).toBeCloseTo(601.5, 1);
    });
  });

  describe('getSummary', () => {
    it('should return summary with tool stats', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordToolExecution('bash', 200, true);
      monitor.recordToolExecution('read', 50, false);

      const summary = monitor.getSummary();

      expect(summary.totalRequests).toBe(3);
      expect(summary.totalErrors).toBe(1);
      expect(summary.successRate).toBe('66.67');
    });

    it('should include uptime', () => {
      const summary = monitor.getSummary();
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty state', () => {
      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.totalErrors).toBe(0);
      expect(summary.successRate).toBe('0');
    });

    it('should include toolStats', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordToolExecution('bash', 200, true);

      const summary = monitor.getSummary();
      expect(summary.toolStats?.bash).toBeDefined();
      expect(summary.toolStats?.bash.count).toBe(2);
    });

    it('should include apiStats', () => {
      monitor.recordApiCall('openai', 100, true);
      monitor.recordApiCall('openai', 200, true);

      const summary = monitor.getSummary();
      expect(summary.apiStats?.openai).toBeDefined();
      expect(summary.apiStats?.openai.count).toBe(2);
    });
  });

  describe('logSummary', () => {
    it('should log summary without error', () => {
      monitor.recordToolExecution('bash', 100, true);
      expect(() => monitor.logSummary()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordApiCall('openai', 500, true);
      monitor.reset();

      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.totalErrors).toBe(0);
    });

    it('should reset uptime', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      monitor.reset();

      const summary = monitor.getSummary();
      expect(summary.uptime).toBeLessThan(1);
    });
  });

  describe('getPerformanceMonitor singleton', () => {
    it('should return the same instance', () => {
      const monitor1 = getPerformanceMonitor();
      const monitor2 = getPerformanceMonitor();
      expect(monitor1).toBe(monitor2);
    });
  });

  describe('createPerformanceMonitor', () => {
    it('should create new instances', () => {
      const monitor1 = createPerformanceMonitor();
      const monitor2 = createPerformanceMonitor();
      expect(monitor1).not.toBe(monitor2);
    });
  });

  describe('success rate calculation', () => {
    it('should calculate 100% when all successful', () => {
      monitor.recordToolExecution('tool', 100, true);
      monitor.recordToolExecution('tool', 100, true);
      monitor.recordToolExecution('tool', 100, true);

      const summary = monitor.getSummary();
      expect(parseFloat(summary.successRate as string)).toBe(100);
    });

    it('should calculate 0% when all failed', () => {
      monitor.recordToolExecution('tool', 100, false);
      monitor.recordToolExecution('tool', 100, false);

      const summary = monitor.getSummary();
      expect(parseFloat(summary.successRate as string)).toBe(0);
    });

    it('should calculate 50% when half failed', () => {
      monitor.recordToolExecution('tool', 100, true);
      monitor.recordToolExecution('tool', 100, false);

      const summary = monitor.getSummary();
      expect(parseFloat(summary.successRate as string)).toBe(50);
    });
  });

  describe('mixed recordings', () => {
    it('should track both tools and API calls', () => {
      monitor.recordToolExecution('bash', 100, true);
      monitor.recordApiCall('openai', 500, true);
      monitor.recordToolExecution('read', 50, false);
      monitor.recordApiCall('anthropic', 300, false);

      const summary = monitor.getSummary();
      expect(summary.totalRequests).toBe(4);
      expect(summary.totalErrors).toBe(2);
      expect(parseFloat(summary.successRate as string)).toBe(50);
    });
  });
});
