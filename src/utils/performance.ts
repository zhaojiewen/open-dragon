/**
 * Performance monitoring and metrics collection
 */

import { getLogger } from './logger.js';

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface MetricsSummary {
  toolExecutions: Map<string, number[]>;
  apiCalls: Map<string, number[]>;
  totalRequests: number;
  totalErrors: number;
  uptime: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private summary: MetricsSummary;
  private startTime: number;
  private logger = getLogger();

  constructor() {
    this.startTime = Date.now();
    this.summary = {
      toolExecutions: new Map(),
      apiCalls: new Map(),
      totalRequests: 0,
      totalErrors: 0,
      uptime: 0,
    };
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };
    this.metrics.set(name, metric);
    this.logger.debug(`Timer started: ${name}`, metadata);
  }

  /**
   * End timing an operation
   */
  endTimer(name: string): number | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.logger.warn(`Timer not found: ${name}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    // Remove the timer after ending
    this.metrics.delete(name);

    this.logger.debug(`Timer ended: ${name}`, {
      durationMs: metric.duration.toFixed(2),
      durationSec: (metric.duration / 1000).toFixed(3),
    });

    return metric.duration;
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    this.startTimer(name, metadata);
    try {
      const result = await operation();
      const duration = this.endTimer(name);
      this.logger.debug(`Operation completed: ${name}`, { duration: `${duration?.toFixed(2)}ms` });
      return result;
    } catch (error) {
      const duration = this.endTimer(name);
      this.logger.error(`Operation failed: ${name}`, {
        duration: `${duration?.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record a tool execution
   */
  recordToolExecution(toolName: string, duration: number, success: boolean): void {
    if (!this.summary.toolExecutions.has(toolName)) {
      this.summary.toolExecutions.set(toolName, []);
    }
    this.summary.toolExecutions.get(toolName)!.push(duration);
    this.summary.totalRequests++;

    if (!success) {
      this.summary.totalErrors++;
    }

    this.logger.debug(`Tool execution recorded: ${toolName}`, {
      duration: `${duration.toFixed(2)}ms`,
      success,
    });
  }

  /**
   * Record an API call
   */
  recordApiCall(provider: string, duration: number, success: boolean): void {
    if (!this.summary.apiCalls.has(provider)) {
      this.summary.apiCalls.set(provider, []);
    }
    this.summary.apiCalls.get(provider)!.push(duration);
    this.summary.totalRequests++;

    if (!success) {
      this.summary.totalErrors++;
    }

    this.logger.debug(`API call recorded: ${provider}`, {
      duration: `${duration.toFixed(2)}ms`,
      success,
    });
  }

  /**
   * Get statistics for a specific metric
   */
  getStats(values: number[]): {
    count: number;
    avg: number;
    min: number;
    max: number;
    total: number;
  } {
    if (values.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, total: 0 };
    }

    const total = values.reduce((sum, val) => sum + val, 0);
    const avg = total / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: values.length,
      avg: Number(avg.toFixed(2)),
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  /**
   * Get metrics summary
   */
  getSummary(): MetricsSummary & Record<string, unknown> {
    const now = Date.now();
    this.summary.uptime = now - this.startTime;

    const toolStats: Record<string, ReturnType<typeof this.getStats>> = {};
    this.summary.toolExecutions.forEach((durations, tool) => {
      toolStats[tool] = this.getStats(durations);
    });

    const apiStats: Record<string, ReturnType<typeof this.getStats>> = {};
    this.summary.apiCalls.forEach((durations, provider) => {
      apiStats[provider] = this.getStats(durations);
    });

    return {
      ...this.summary,
      uptime: Number((this.summary.uptime / 1000).toFixed(2)),
      toolStats,
      apiStats,
      successRate: this.summary.totalRequests > 0
        ? (((this.summary.totalRequests - this.summary.totalErrors) / this.summary.totalRequests) * 100).toFixed(2)
        : '0',
    };
  }

  /**
   * Log summary to console
   */
  logSummary(): void {
    const summary = this.getSummary();
    this.logger.info('Performance Summary:', summary);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
    this.summary = {
      toolExecutions: new Map(),
      apiCalls: new Map(),
      totalRequests: 0,
      totalErrors: 0,
      uptime: 0,
    };
    this.logger.debug('Performance metrics reset');
  }
}

// Global performance monitor instance
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

export { PerformanceMonitor };
