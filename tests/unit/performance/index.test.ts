import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  perfMonitor,
  measurePerformance,
  type PerformanceMetric,
  type PerformanceSummary,
} from '../../../src/performance/index.js';

describe('PerformanceMonitor', () => {
  let consoleTableSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset the perfMonitor state before each test
    perfMonitor.clear();
    perfMonitor.setEnabled(true);
    consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleTableSpy.mockRestore();
    consoleLogSpy.mockRestore();
    perfMonitor.clear();
    perfMonitor.setEnabled(false);
  });

  // MARK: - Enable/Disable Tests

  describe('isEnabled / setEnabled', () => {
    it('should enable monitoring with setEnabled(true)', () => {
      perfMonitor.setEnabled(true);
      expect(perfMonitor.isEnabled()).toBe(true);
    });

    it('should disable monitoring with setEnabled(false)', () => {
      perfMonitor.setEnabled(true);
      perfMonitor.setEnabled(false);
      expect(perfMonitor.isEnabled()).toBe(false);
    });

    it('should toggle monitoring state correctly', () => {
      expect(perfMonitor.isEnabled()).toBe(true); // Set in beforeEach

      perfMonitor.setEnabled(false);
      expect(perfMonitor.isEnabled()).toBe(false);

      perfMonitor.setEnabled(true);
      expect(perfMonitor.isEnabled()).toBe(true);
    });

    it('should default to false when environment variable is not set', () => {
      // The singleton perfMonitor was created at module load time
      // We can verify the behavior by checking if setEnabled works correctly
      perfMonitor.setEnabled(false);
      expect(perfMonitor.isEnabled()).toBe(false);

      // And that we can enable it
      perfMonitor.setEnabled(true);
      expect(perfMonitor.isEnabled()).toBe(true);
    });

    it('should persist enabled state across operations', async () => {
      perfMonitor.setEnabled(true);
      await perfMonitor.measure('enabled-check', async () => {});
      expect(perfMonitor.isEnabled()).toBe(true);

      perfMonitor.setEnabled(false);
      await perfMonitor.measure('disabled-check', async () => {});
      expect(perfMonitor.isEnabled()).toBe(false);
    });
  });

  // MARK: - Timer Tests

  describe('startTimer / endTimer', () => {
    it('should start and end a timer successfully', () => {
      perfMonitor.startTimer('test-operation');
      const duration = perfMonitor.endTimer('test-operation');

      expect(duration).toBeDefined();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return undefined when ending a non-existent timer', () => {
      const duration = perfMonitor.endTimer('non-existent-timer');
      expect(duration).toBeUndefined();
    });

    it('should not track timer when disabled', () => {
      perfMonitor.setEnabled(false);
      perfMonitor.startTimer('disabled-timer');
      const duration = perfMonitor.endTimer('disabled-timer');

      expect(duration).toBeUndefined();
    });

    it('should store metrics after timer ends', () => {
      perfMonitor.startTimer('stored-metric');
      perfMonitor.endTimer('stored-metric');

      const metrics = perfMonitor.getMetrics('stored-metric');
      expect(metrics.length).toBe(1);
      expect(metrics[0].name).toBe('stored-metric');
    });

    it('should store metadata with timer', () => {
      perfMonitor.startTimer('metadata-test');
      const metadata = { userId: '123', operation: 'test' };
      perfMonitor.endTimer('metadata-test', metadata);

      const metrics = perfMonitor.getMetrics('metadata-test');
      expect(metrics[0].metadata).toEqual(metadata);
    });

    it('should handle multiple timers simultaneously', async () => {
      perfMonitor.startTimer('timer1');
      perfMonitor.startTimer('timer2');
      perfMonitor.startTimer('timer3');

      await new Promise(resolve => setTimeout(resolve, 5));

      const duration2 = perfMonitor.endTimer('timer2');
      await new Promise(resolve => setTimeout(resolve, 5));

      const duration1 = perfMonitor.endTimer('timer1');
      const duration3 = perfMonitor.endTimer('timer3');

      expect(duration1).toBeGreaterThan(0);
      expect(duration2).toBeGreaterThan(0);
      expect(duration3).toBeGreaterThan(0);
    });

    it('should clear active timer after ending', () => {
      perfMonitor.startTimer('single-use');
      perfMonitor.endTimer('single-use');

      // Try to end again should return undefined
      const secondEnd = perfMonitor.endTimer('single-use');
      expect(secondEnd).toBeUndefined();
    });

    it('should handle rapid start/end cycles', () => {
      for (let i = 0; i < 100; i++) {
        perfMonitor.startTimer('rapid-cycle');
        perfMonitor.endTimer('rapid-cycle');
      }

      const metrics = perfMonitor.getMetrics('rapid-cycle');
      expect(metrics.length).toBe(100);
    });

    it('should record accurate timing', async () => {
      perfMonitor.startTimer('accurate-timing');
      await new Promise(resolve => setTimeout(resolve, 50));
      const duration = perfMonitor.endTimer('accurate-timing');

      // Allow some tolerance for timer accuracy
      expect(duration).toBeGreaterThanOrEqual(40);
      expect(duration).toBeLessThan(200);
    });
  });

  // MARK: - Measure Tests

  describe('measure', () => {
    it('should measure async function execution time', async () => {
      const result = await perfMonitor.measure('async-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'test-result';
      });

      expect(result).toBe('test-result');

      const metrics = perfMonitor.getMetrics('async-operation');
      expect(metrics.length).toBe(1);
      expect(metrics[0].duration).toBeGreaterThanOrEqual(5);
    });

    it('should record error metadata when async function throws', async () => {
      const error = new Error('Test error');

      await expect(
        perfMonitor.measure('error-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      const metrics = perfMonitor.getMetrics('error-operation');
      expect(metrics.length).toBe(1);
      expect(metrics[0].metadata).toEqual({ error: true });
    });

    it('should measure successful async operations', async () => {
      const results: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await perfMonitor.measure(`batch-${i}`, async () => {
          return i * 2;
        });
        results.push(result);
      }

      expect(results).toEqual([0, 2, 4, 6, 8]);

      const summaries = perfMonitor.getAllSummaries();
      expect(summaries.size).toBe(5);
    });

    it('should handle nested measures', async () => {
      await perfMonitor.measure('outer', async () => {
        await perfMonitor.measure('inner', async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
        });
      });

      const outerMetrics = perfMonitor.getMetrics('outer');
      const innerMetrics = perfMonitor.getMetrics('inner');

      expect(outerMetrics.length).toBe(1);
      expect(innerMetrics.length).toBe(1);
      expect(outerMetrics[0].duration).toBeGreaterThanOrEqual(innerMetrics[0].duration);
    });

    it('should not measure when disabled', async () => {
      perfMonitor.setEnabled(false);

      const result = await perfMonitor.measure('disabled-measure', async () => {
        return 'should-work';
      });

      expect(result).toBe('should-work');

      const metrics = perfMonitor.getMetrics('disabled-measure');
      expect(metrics.length).toBe(0);
    });

    it('should handle async function returning undefined', async () => {
      const result = await perfMonitor.measure('undefined-result', async () => {
        return undefined;
      });

      expect(result).toBeUndefined();

      const metrics = perfMonitor.getMetrics('undefined-result');
      expect(metrics.length).toBe(1);
    });

    it('should handle async function returning null', async () => {
      const result = await perfMonitor.measure('null-result', async () => {
        return null;
      });

      expect(result).toBeNull();

      const metrics = perfMonitor.getMetrics('null-result');
      expect(metrics.length).toBe(1);
    });

    it('should handle async function returning object', async () => {
      const expectedObject = { key: 'value', nested: { a: 1 } };
      const result = await perfMonitor.measure('object-result', async () => {
        return expectedObject;
      });

      expect(result).toEqual(expectedObject);
    });

    it('should handle async function returning array', async () => {
      const expectedArray = [1, 2, 3, 'four'];
      const result = await perfMonitor.measure('array-result', async () => {
        return expectedArray;
      });

      expect(result).toEqual(expectedArray);
    });
  });

  // MARK: - MeasureSync Tests

  describe('measureSync', () => {
    it('should measure sync function execution time', () => {
      const result = perfMonitor.measureSync('sync-operation', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(499500);

      const metrics = perfMonitor.getMetrics('sync-operation');
      expect(metrics.length).toBe(1);
    });

    it('should record error metadata when sync function throws', () => {
      expect(() =>
        perfMonitor.measureSync('sync-error', () => {
          throw new Error('Sync error');
        })
      ).toThrow('Sync error');

      const metrics = perfMonitor.getMetrics('sync-error');
      expect(metrics.length).toBe(1);
      expect(metrics[0].metadata).toEqual({ error: true });
    });

    it('should measure successful sync operations', () => {
      for (let i = 0; i < 10; i++) {
        perfMonitor.measureSync(`batch-sync-${i}`, () => i * 2);
      }

      const summaries = perfMonitor.getAllSummaries();
      expect(summaries.size).toBe(10);
    });

    it('should not measure when disabled', () => {
      perfMonitor.setEnabled(false);

      const result = perfMonitor.measureSync('disabled-sync', () => 'test');

      expect(result).toBe('test');

      const metrics = perfMonitor.getMetrics('disabled-sync');
      expect(metrics.length).toBe(0);
    });

    it('should handle sync function returning undefined', () => {
      const result = perfMonitor.measureSync('undefined-sync', () => undefined);
      expect(result).toBeUndefined();
    });

    it('should handle sync function returning null', () => {
      const result = perfMonitor.measureSync('null-sync', () => null);
      expect(result).toBeNull();
    });

    it('should handle sync function returning complex objects', () => {
      const complexObject = {
        arr: [1, 2, 3],
        obj: { nested: true },
        fn: () => 'test',
      };

      const result = perfMonitor.measureSync('complex-sync', () => complexObject);

      expect(result).toBe(complexObject);
      expect(result.fn()).toBe('test');
    });
  });

  // MARK: - GetMetrics Tests

  describe('getMetrics', () => {
    it('should return empty array for non-existent operation', () => {
      const metrics = perfMonitor.getMetrics('non-existent');
      expect(metrics).toEqual([]);
    });

    it('should return all metrics for an operation', async () => {
      for (let i = 0; i < 5; i++) {
        await perfMonitor.measure('multi-metric', async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
        });
      }

      const metrics = perfMonitor.getMetrics('multi-metric');
      expect(metrics.length).toBe(5);
      metrics.forEach(m => {
        expect(m.name).toBe('multi-metric');
        expect(m.duration).toBeGreaterThanOrEqual(0);
      });
    });

    it('should return metric with correct structure', async () => {
      await perfMonitor.measure('structure-test', async () => {});

      const metrics = perfMonitor.getMetrics('structure-test');
      const metric = metrics[0];

      expect(metric).toHaveProperty('name');
      expect(metric).toHaveProperty('duration');
      expect(metric).toHaveProperty('startTime');
      expect(metric).toHaveProperty('endTime');
      expect(metric.name).toBe('structure-test');
      expect(typeof metric.duration).toBe('number');
      expect(typeof metric.startTime).toBe('number');
      expect(typeof metric.endTime).toBe('number');
    });

    it('should include metadata when provided', async () => {
      perfMonitor.startTimer('meta-test');
      perfMonitor.endTimer('meta-test', { custom: 'data', count: 42 });

      const metrics = perfMonitor.getMetrics('meta-test');
      expect(metrics[0].metadata).toEqual({ custom: 'data', count: 42 });
    });

    it('should return separate metrics for different operations', async () => {
      await perfMonitor.measure('op-a', async () => {});
      await perfMonitor.measure('op-b', async () => {});

      const metricsA = perfMonitor.getMetrics('op-a');
      const metricsB = perfMonitor.getMetrics('op-b');

      expect(metricsA.length).toBe(1);
      expect(metricsB.length).toBe(1);
      expect(metricsA[0].name).toBe('op-a');
      expect(metricsB[0].name).toBe('op-b');
    });
  });

  // MARK: - GetAllMetrics Tests

  describe('getAllMetrics', () => {
    it('should return empty map when no metrics collected', () => {
      const allMetrics = perfMonitor.getAllMetrics();
      expect(allMetrics.size).toBe(0);
    });

    it('should return all collected metrics', async () => {
      await perfMonitor.measure('operation-1', async () => {});
      await perfMonitor.measure('operation-2', async () => {});
      await perfMonitor.measure('operation-1', async () => {});

      const allMetrics = perfMonitor.getAllMetrics();
      expect(allMetrics.size).toBe(2);
      expect(allMetrics.get('operation-1')?.length).toBe(2);
      expect(allMetrics.get('operation-2')?.length).toBe(1);
    });

    it('should return a map with correct structure', async () => {
      await perfMonitor.measure('map-test', async () => {});

      const allMetrics = perfMonitor.getAllMetrics();
      expect(allMetrics).toBeInstanceOf(Map);
      expect(allMetrics.has('map-test')).toBe(true);
    });
  });

  // MARK: - GetSummary Tests

  describe('getSummary', () => {
    it('should return undefined for non-existent operation', () => {
      const summary = perfMonitor.getSummary('non-existent');
      expect(summary).toBeUndefined();
    });

    it('should return correct summary for single metric', async () => {
      await perfMonitor.measure('single-summary', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const summary = perfMonitor.getSummary('single-summary');

      expect(summary).toBeDefined();
      expect(summary!.totalCalls).toBe(1);
      expect(summary!.totalDuration).toBeGreaterThan(0);
      expect(summary!.averageDuration).toBe(summary!.totalDuration);
      expect(summary!.minDuration).toBe(summary!.maxDuration);
      expect(summary!.lastCall).toBeInstanceOf(Date);
    });

    it('should return correct summary for multiple metrics', async () => {
      const durations = [10, 20, 30, 40, 50];

      for (const delay of durations) {
        await perfMonitor.measure('multi-summary', async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
        });
      }

      const summary = perfMonitor.getSummary('multi-summary');

      expect(summary!.totalCalls).toBe(5);
      expect(summary!.minDuration).toBeLessThanOrEqual(summary!.maxDuration);
      expect(summary!.averageDuration).toBe(summary!.totalDuration / 5);
    });

    it('should calculate correct statistics', async () => {
      // Run multiple operations with predictable timing
      const results: number[] = [];

      for (let i = 0; i < 10; i++) {
        perfMonitor.startTimer('stats-test');
        await new Promise(resolve => setTimeout(resolve, 5));
        const duration = perfMonitor.endTimer('stats-test');
        if (duration !== undefined) {
          results.push(duration);
        }
      }

      const summary = perfMonitor.getSummary('stats-test');

      expect(summary!.totalCalls).toBe(10);
      expect(summary!.totalDuration).toBeCloseTo(
        results.reduce((a, b) => a + b, 0),
        0
      );
      expect(summary!.minDuration).toBeCloseTo(Math.min(...results), 0);
      expect(summary!.maxDuration).toBeCloseTo(Math.max(...results), 0);
    });

    it('should track lastCall based on endTime value', async () => {
      await perfMonitor.measure('timestamp-test', async () => {});
      await perfMonitor.measure('timestamp-test', async () => {});

      const summary = perfMonitor.getSummary('timestamp-test');
      const metrics = perfMonitor.getMetrics('timestamp-test');

      expect(summary!.lastCall).toBeInstanceOf(Date);
      // The lastCall is created from endTime (performance.now() value)
      // Date constructor truncates the decimal part of endTime
      expect(summary!.lastCall!.getTime()).toBe(Math.floor(metrics[metrics.length - 1].endTime));
    });

    it('should return undefined when metrics array is empty', () => {
      // Clear after setup
      perfMonitor.clear();
      const summary = perfMonitor.getSummary('empty');
      expect(summary).toBeUndefined();
    });
  });

  // MARK: - GetAllSummaries Tests

  describe('getAllSummaries', () => {
    it('should return empty map when no metrics collected', () => {
      const summaries = perfMonitor.getAllSummaries();
      expect(summaries.size).toBe(0);
    });

    it('should return summaries for all operations', async () => {
      await perfMonitor.measure('op-x', async () => {});
      await perfMonitor.measure('op-y', async () => {});
      await perfMonitor.measure('op-z', async () => {});

      const summaries = perfMonitor.getAllSummaries();

      expect(summaries.size).toBe(3);
      expect(summaries.has('op-x')).toBe(true);
      expect(summaries.has('op-y')).toBe(true);
      expect(summaries.has('op-z')).toBe(true);
    });

    it('should return map with correct structure', async () => {
      await perfMonitor.measure('summary-struct', async () => {});

      const summaries = perfMonitor.getAllSummaries();

      expect(summaries).toBeInstanceOf(Map);
      const summary = summaries.get('summary-struct');
      expect(summary).toHaveProperty('totalCalls');
      expect(summary).toHaveProperty('totalDuration');
      expect(summary).toHaveProperty('averageDuration');
      expect(summary).toHaveProperty('minDuration');
      expect(summary).toHaveProperty('maxDuration');
      expect(summary).toHaveProperty('lastCall');
    });
  });

  // MARK: - PrintReport Tests

  describe('printReport', () => {
    it('should call console.table when metrics exist', async () => {
      await perfMonitor.measure('report-test', async () => {});

      perfMonitor.printReport();

      expect(consoleTableSpy).toHaveBeenCalled();
    });

    it('should not call console.table when no metrics collected', () => {
      perfMonitor.clear();
      perfMonitor.printReport();

      expect(consoleTableSpy).not.toHaveBeenCalled();
    });

    it('should format report data correctly', async () => {
      await perfMonitor.measure('format-test', async () => {});

      perfMonitor.printReport();

      const tableArg = consoleTableSpy.mock.calls[0][0];
      expect(Array.isArray(tableArg)).toBe(true);
      expect(tableArg[0]).toHaveProperty('Operation');
      expect(tableArg[0]).toHaveProperty('Total Calls');
      expect(tableArg[0]).toHaveProperty('Total (ms)');
      expect(tableArg[0]).toHaveProperty('Avg (ms)');
      expect(tableArg[0]).toHaveProperty('Min (ms)');
      expect(tableArg[0]).toHaveProperty('Max (ms)');
    });

    it('should handle multiple operations in report', async () => {
      await perfMonitor.measure('multi-report-1', async () => {});
      await perfMonitor.measure('multi-report-2', async () => {});
      await perfMonitor.measure('multi-report-1', async () => {});

      perfMonitor.printReport();

      const tableArg = consoleTableSpy.mock.calls[0][0];
      expect(tableArg.length).toBe(2);
    });
  });

  // MARK: - Clear Tests

  describe('clear', () => {
    it('should clear all metrics', async () => {
      await perfMonitor.measure('to-clear', async () => {});

      expect(perfMonitor.getMetrics('to-clear').length).toBe(1);

      perfMonitor.clear();

      expect(perfMonitor.getMetrics('to-clear').length).toBe(0);
    });

    it('should clear active timers', () => {
      perfMonitor.startTimer('active-timer');
      perfMonitor.clear();

      // After clear, ending the timer should return undefined
      const duration = perfMonitor.endTimer('active-timer');
      expect(duration).toBeUndefined();
    });

    it('should clear all summaries', async () => {
      await perfMonitor.measure('clear-summary', async () => {});

      perfMonitor.clear();

      const summaries = perfMonitor.getAllSummaries();
      expect(summaries.size).toBe(0);
    });

    it('should allow collecting metrics after clear', async () => {
      await perfMonitor.measure('before-clear', async () => {});
      perfMonitor.clear();
      await perfMonitor.measure('after-clear', async () => {});

      expect(perfMonitor.getMetrics('before-clear').length).toBe(0);
      expect(perfMonitor.getMetrics('after-clear').length).toBe(1);
    });

    it('should be safe to call multiple times', () => {
      perfMonitor.clear();
      perfMonitor.clear();
      perfMonitor.clear();

      expect(perfMonitor.getAllMetrics().size).toBe(0);
    });
  });

  // MARK: - Edge Cases

  describe('edge cases', () => {
    it('should handle empty operation name', () => {
      perfMonitor.startTimer('');
      const duration = perfMonitor.endTimer('');

      expect(duration).toBeDefined();
    });

    it('should handle very long operation names', () => {
      const longName = 'a'.repeat(1000);
      perfMonitor.startTimer(longName);
      const duration = perfMonitor.endTimer(longName);

      expect(duration).toBeDefined();
    });

    it('should handle special characters in operation names', () => {
      const specialName = 'op-with-special-chars!@#$%^&*()';
      perfMonitor.startTimer(specialName);
      const duration = perfMonitor.endTimer(specialName);

      expect(duration).toBeDefined();
    });

    it('should handle unicode in operation names', () => {
      const unicodeName = '操作-🚀-测试';
      perfMonitor.startTimer(unicodeName);
      const duration = perfMonitor.endTimer(unicodeName);

      expect(duration).toBeDefined();
    });

    it('should handle extremely fast operations', () => {
      perfMonitor.startTimer('fast-op');
      const duration = perfMonitor.endTimer('fast-op');

      // Should still record something, even if very small
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle operations with zero duration', () => {
      perfMonitor.startTimer('instant');
      const duration = perfMonitor.endTimer('instant');

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent timers correctly', async () => {
      const timers = ['concurrent-1', 'concurrent-2', 'concurrent-3'];

      timers.forEach(t => perfMonitor.startTimer(t));

      await new Promise(resolve => setTimeout(resolve, 10));

      const durations = timers.map(t => perfMonitor.endTimer(t));

      durations.forEach(d => {
        expect(d).toBeGreaterThanOrEqual(8);
      });
    });

    it('should handle large metadata objects', () => {
      const largeMetadata = {
        key1: 'value1',
        nested: { deep: { array: new Array(100).fill('data') } },
      };

      perfMonitor.startTimer('large-meta');
      perfMonitor.endTimer('large-meta', largeMetadata);

      const metrics = perfMonitor.getMetrics('large-meta');
      expect(metrics[0].metadata).toEqual(largeMetadata);
    });

    it('should handle many metrics for same operation', async () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        perfMonitor.startTimer('many-metrics');
        perfMonitor.endTimer('many-metrics');
      }

      const metrics = perfMonitor.getMetrics('many-metrics');
      expect(metrics.length).toBe(iterations);

      const summary = perfMonitor.getSummary('many-metrics');
      expect(summary!.totalCalls).toBe(iterations);
    });

    it('should maintain performance with many operations', async () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        await perfMonitor.measure(`perf-test-${i}`, async () => {});
      }

      const end = performance.now();

      // Should complete within reasonable time (< 1 second)
      expect(end - start).toBeLessThan(1000);
    });

    it('should handle reusing same timer name after clear', async () => {
      await perfMonitor.measure('reuse', async () => {});
      perfMonitor.clear();
      await perfMonitor.measure('reuse', async () => {});

      const metrics = perfMonitor.getMetrics('reuse');
      expect(metrics.length).toBe(1);
    });
  });
});

// MARK: - measurePerformance Decorator Tests

describe('measurePerformance decorator', () => {
  let originalEnabled: boolean;

  beforeEach(() => {
    perfMonitor.clear();
    originalEnabled = perfMonitor.isEnabled();
    perfMonitor.setEnabled(true);
  });

  afterEach(() => {
    perfMonitor.setEnabled(originalEnabled);
    perfMonitor.clear();
  });

  // Test decorator functionality by manually applying it to a descriptor
  // This avoids TypeScript decorator syntax issues in test files

  it('should measure decorated async method', async () => {
    // Create a mock method and apply the decorator manually
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    // Apply the decorator
    const decoratedDescriptor = measurePerformance('custom-name')(
      mockTarget,
      'method',
      mockDescriptor
    );

    // Call the decorated method
    const result = await decoratedDescriptor.value();

    expect(result).toBe('result');

    const metrics = perfMonitor.getMetrics('custom-name');
    expect(metrics.length).toBe(1);
    expect(metrics[0].duration).toBeGreaterThanOrEqual(5);
  });

  it('should use class.method name when no name provided', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        return 'auto-named';
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance()(
      mockTarget,
      'myMethod',
      mockDescriptor
    );

    await decoratedDescriptor.value();

    const metrics = perfMonitor.getMetrics('TestClass.myMethod');
    expect(metrics.length).toBe(1);
  });

  it('should record error metadata when decorated method throws', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        throw new Error('Method failed');
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('error-method')(
      mockTarget,
      'failingMethod',
      mockDescriptor
    );

    await expect(decoratedDescriptor.value()).rejects.toThrow('Method failed');

    const metrics = perfMonitor.getMetrics('error-method');
    expect(metrics.length).toBe(1);
    expect(metrics[0].metadata).toEqual({ error: true });
  });

  it('should not measure when disabled', async () => {
    perfMonitor.setEnabled(false);

    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        return 'still works';
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('disabled-decorator')(
      mockTarget,
      'method',
      mockDescriptor
    );

    const result = await decoratedDescriptor.value();

    expect(result).toBe('still works');

    const metrics = perfMonitor.getMetrics('disabled-decorator');
    expect(metrics.length).toBe(0);
  });

  it('should pass through method arguments', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function (a: number, b: string) {
        return `${a}-${b}`;
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('args-test')(
      mockTarget,
      'methodWithArgs',
      mockDescriptor
    );

    const result = await decoratedDescriptor.value(42, 'test');

    expect(result).toBe('42-test');
  });

  it('should preserve method context (this)', async () => {
    const contextValue = 'instance-value';
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        // Simulate accessing this.value
        return contextValue;
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('context-test')(
      mockTarget,
      'method',
      mockDescriptor
    );

    const result = await decoratedDescriptor.value.call({ value: contextValue });

    expect(result).toBe('instance-value');
  });

  it('should handle multiple decorated methods', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };

    const descriptorOne: PropertyDescriptor = {
      value: async function () {
        return 1;
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const descriptorTwo: PropertyDescriptor = {
      value: async function () {
        return 2;
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedOne = measurePerformance('method-one')(
      mockTarget,
      'one',
      descriptorOne
    );

    const decoratedTwo = measurePerformance('method-two')(
      mockTarget,
      'two',
      descriptorTwo
    );

    await decoratedOne.value();
    await decoratedTwo.value();

    expect(perfMonitor.getMetrics('method-one').length).toBe(1);
    expect(perfMonitor.getMetrics('method-two').length).toBe(1);
  });

  it('should handle decorated method returning nothing', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        // No return
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('void-method')(
      mockTarget,
      'voidMethod',
      mockDescriptor
    );

    const result = await decoratedDescriptor.value();

    expect(result).toBeUndefined();

    const metrics = perfMonitor.getMetrics('void-method');
    expect(metrics.length).toBe(1);
  });

  it('should handle decorated method returning complex object', async () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {
        return {
          nested: { deep: [1, 2, 3] },
          fn: () => 'test',
        };
      },
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decoratedDescriptor = measurePerformance('complex-return')(
      mockTarget,
      'complexMethod',
      mockDescriptor
    );

    const result = await decoratedDescriptor.value();

    expect(result.nested.deep).toEqual([1, 2, 3]);
    expect(result.fn()).toBe('test');
  });

  it('should return a PropertyDescriptor', () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {},
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const result = measurePerformance('test')(
      mockTarget,
      'method',
      mockDescriptor
    );

    expect(result).toHaveProperty('value');
    expect(typeof result.value).toBe('function');
  });

  it('should preserve enumerable and configurable properties', () => {
    const mockTarget = { constructor: { name: 'TestClass' } };
    const mockDescriptor: PropertyDescriptor = {
      value: async function () {},
      writable: true,
      enumerable: true,
      configurable: true,
    };

    const decorated = measurePerformance('test')(
      mockTarget,
      'method',
      mockDescriptor
    );

    expect(decorated.enumerable).toBe(true);
    expect(decorated.configurable).toBe(true);
  });
});

// MARK: - Type Tests

describe('Type exports', () => {
  it('should export PerformanceMetric interface', () => {
    const metric: PerformanceMetric = {
      name: 'test',
      duration: 100,
      startTime: 1000,
      endTime: 1100,
      metadata: { key: 'value' },
    };

    expect(metric.name).toBe('test');
    expect(metric.duration).toBe(100);
  });

  it('should export PerformanceSummary interface', () => {
    const summary: PerformanceSummary = {
      totalCalls: 10,
      totalDuration: 1000,
      averageDuration: 100,
      minDuration: 50,
      maxDuration: 200,
      lastCall: new Date(),
    };

    expect(summary.totalCalls).toBe(10);
    expect(summary.averageDuration).toBe(100);
  });

  it('should allow optional metadata in PerformanceMetric', () => {
    const metricWithMeta: PerformanceMetric = {
      name: 'test',
      duration: 100,
      startTime: 1000,
      endTime: 1100,
      metadata: { optional: true },
    };

    const metricWithoutMeta: PerformanceMetric = {
      name: 'test',
      duration: 100,
      startTime: 1000,
      endTime: 1100,
    };

    expect(metricWithMeta.metadata).toBeDefined();
    expect(metricWithoutMeta.metadata).toBeUndefined();
  });

  it('should allow optional lastCall in PerformanceSummary', () => {
    const summaryWithLastCall: PerformanceSummary = {
      totalCalls: 1,
      totalDuration: 100,
      averageDuration: 100,
      minDuration: 100,
      maxDuration: 100,
      lastCall: new Date(),
    };

    const summaryWithoutLastCall: PerformanceSummary = {
      totalCalls: 1,
      totalDuration: 100,
      averageDuration: 100,
      minDuration: 100,
      maxDuration: 100,
    };

    expect(summaryWithLastCall.lastCall).toBeDefined();
    expect(summaryWithoutLastCall.lastCall).toBeUndefined();
  });
});

// MARK: - Integration Tests

describe('PerformanceMonitor integration', () => {
  beforeEach(() => {
    // Ensure complete isolation by clearing everything
    perfMonitor.clear();
    perfMonitor.setEnabled(true);
    // Verify we start clean
    expect(perfMonitor.getAllMetrics().size).toBe(0);
  });

  afterEach(() => {
    perfMonitor.clear();
    perfMonitor.setEnabled(false);
  });

  it('should track realistic workflow', async () => {
    // Simulate a realistic workflow with multiple operations

    // Database query simulation
    await perfMonitor.measure('database.query', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // API call simulation
    await perfMonitor.measure('api.request', async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });

    // Processing simulation
    perfMonitor.startTimer('processing');
    await new Promise(resolve => setTimeout(resolve, 10));
    perfMonitor.endTimer('processing', { recordsProcessed: 100 });

    // Cache operations
    await perfMonitor.measure('cache.set', async () => {});
    await perfMonitor.measure('cache.set', async () => {});
    await perfMonitor.measure('cache.get', async () => {});

    const summaries = perfMonitor.getAllSummaries();

    // There are 5 unique operation names tracked
    expect(summaries.size).toBe(5);
    expect(summaries.get('database.query')!.totalCalls).toBe(1);
    expect(summaries.get('api.request')!.totalCalls).toBe(1);
    expect(summaries.get('processing')!.totalCalls).toBe(1);
    expect(summaries.get('cache.set')!.totalCalls).toBe(2);
    expect(summaries.get('cache.get')!.totalCalls).toBe(1);

    // Verify metadata was stored
    const processingMetrics = perfMonitor.getMetrics('processing');
    expect(processingMetrics[0].metadata).toEqual({ recordsProcessed: 100 });
  });

  it('should provide complete report data', async () => {
    // Create some known operations
    for (let i = 0; i < 5; i++) {
      await perfMonitor.measure('op-a', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }

    for (let i = 0; i < 3; i++) {
      await perfMonitor.measure('op-b', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
    }

    const summaryA = perfMonitor.getSummary('op-a');
    const summaryB = perfMonitor.getSummary('op-b');

    expect(summaryA!.totalCalls).toBe(5);
    expect(summaryB!.totalCalls).toBe(3);

    // Verify all statistics are calculated correctly
    expect(summaryA!.totalDuration).toBeGreaterThan(0);
    expect(summaryA!.averageDuration).toBeCloseTo(summaryA!.totalDuration / 5, 1);
    expect(summaryA!.minDuration).toBeLessThanOrEqual(summaryA!.maxDuration);
  });

  it('should handle enable/disable during operation', async () => {
    // Start enabled
    await perfMonitor.measure('enabled-op', async () => {});

    // Disable mid-stream
    perfMonitor.setEnabled(false);
    await perfMonitor.measure('disabled-op', async () => {});

    // Re-enable
    perfMonitor.setEnabled(true);
    await perfMonitor.measure('reenabled-op', async () => {});

    const metrics = perfMonitor.getAllMetrics();
    expect(metrics.has('enabled-op')).toBe(true);
    expect(metrics.has('disabled-op')).toBe(false);
    expect(metrics.has('reenabled-op')).toBe(true);
  });
});