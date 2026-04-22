import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export interface PerformanceMetric {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, any>;
}

export interface PerformanceSummary {
  totalCalls: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  lastCall?: Date;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private enabled: boolean = process.env.DRAGON_PERF_MONITOR === 'true' || false;

  /**
   * Start timing an operation
   */
  startTimer(name: string): void {
    if (!this.enabled) return;

    const startTime = performance.now();
    this.activeTimers.set(name, startTime);
    logger.debug(`Performance timer started: ${name}`);
  }

  /**
   * End timing an operation
   */
  endTimer(name: string, metadata?: Record<string, any>): number | undefined {
    if (!this.enabled) return undefined;

    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      logger.warn(`Timer not found: ${name}`);
      return undefined;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.activeTimers.delete(name);

    const metric: PerformanceMetric = {
      name,
      duration,
      startTime,
      endTime,
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);

    logger.debug(`Performance timer ended: ${name} (${duration.toFixed(2)}ms)`);

    return duration;
  }

  /**
   * Measure a function's execution time
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.startTimer(name);
    try {
      const result = await fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name, { error: true });
      throw error;
    }
  }

  /**
   * Measure a synchronous function's execution time
   */
  measureSync<T>(name: string, fn: () => T): T {
    this.startTimer(name);
    try {
      const result = fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name, { error: true });
      throw error;
    }
  }

  /**
   * Get all metrics for a specific operation
   */
  getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, PerformanceMetric[]> {
    return this.metrics;
  }

  /**
   * Get performance summary for a specific operation
   */
  getSummary(name: string): PerformanceSummary | undefined {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return undefined;

    const durations = metrics.map(m => m.duration);

    return {
      totalCalls: metrics.length,
      totalDuration: durations.reduce((a, b) => a + b, 0),
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      lastCall: new Date(metrics[metrics.length - 1].endTime),
    };
  }

  /**
   * Get all performance summaries
   */
  getAllSummaries(): Map<string, PerformanceSummary> {
    const summaries = new Map<string, PerformanceSummary>();

    for (const name of this.metrics.keys()) {
      const summary = this.getSummary(name);
      if (summary) {
        summaries.set(name, summary);
      }
    }

    return summaries;
  }

  /**
   * Print performance report
   */
  printReport(): void {
    const summaries = this.getAllSummaries();

    if (summaries.size === 0) {
      logger.info('No performance metrics collected');
      return;
    }

    logger.info('\n📊 Performance Report:');
    logger.info('='.repeat(80));

    const table: any[] = [];
    for (const [name, summary] of summaries) {
      table.push({
        Operation: name,
        'Total Calls': summary.totalCalls,
        'Total (ms)': summary.totalDuration.toFixed(2),
        'Avg (ms)': summary.averageDuration.toFixed(2),
        'Min (ms)': summary.minDuration.toFixed(2),
        'Max (ms)': summary.maxDuration.toFixed(2),
      });
    }

    console.table(table);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.activeTimers.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.debug(`Performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

// Decorator for measuring method performance
export function measurePerformance(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const operationName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      if (!perfMonitor.isEnabled()) {
        return originalMethod.apply(this, args);
      }

      perfMonitor.startTimer(operationName);
      try {
        const result = await originalMethod.apply(this, args);
        perfMonitor.endTimer(operationName);
        return result;
      } catch (error) {
        perfMonitor.endTimer(operationName, { error: true });
        throw error;
      }
    };

    return descriptor;
  };
}
