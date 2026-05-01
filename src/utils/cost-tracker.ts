/**
 * Cost tracker for API usage across providers.
 */

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // Anthropic
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-7': { input: 5.00, output: 25.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  // Gemini
  'gemini-1.5-pro': { input: 2.50, output: 10.00 },
  'gemini-1.5-flash': { input: 0.15, output: 0.60 },
  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // Qwen
  'qwen-max': { input: 2.00, output: 8.00 },
  'qwen-plus': { input: 1.00, output: 4.00 },
  'qwen-turbo': { input: 0.50, output: 2.00 },
};

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cacheCostSavings: number;
  cost: number;
  timestamp: Date;
}

export interface CacheStats {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cacheCostSavings: number;
}

export class CostTracker {
  private records: UsageRecord[] = [];
  private enabled: boolean = true;

  record(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens?: number,
    cacheReadTokens?: number
  ): void {
    if (!this.enabled) return;

    const pricing = MODEL_PRICING[model];
    const cost = pricing
      ? (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
      : 0;

    let cacheCostSavings = 0;
    if (pricing && cacheReadTokens && cacheReadTokens > 0) {
      cacheCostSavings = (cacheReadTokens / 1_000_000) * pricing.input * 0.9;
    }

    this.records.push({
      model,
      inputTokens,
      outputTokens,
      cacheCreationTokens: cacheCreationTokens || 0,
      cacheReadTokens: cacheReadTokens || 0,
      cost,
      cacheCostSavings,
      timestamp: new Date(),
    });
  }

  getSessionCost(): number {
    return this.records.reduce((sum, r) => sum + r.cost, 0);
  }

  getEffectiveCost(): number {
    return this.getSessionCost() - this.getCacheStats().cacheCostSavings;
  }

  getSessionTokens(): { input: number; output: number } {
    return {
      input: this.records.reduce((sum, r) => sum + r.inputTokens, 0),
      output: this.records.reduce((sum, r) => sum + r.outputTokens, 0),
    };
  }

  getTotalTokens(): number {
    const t = this.getSessionTokens();
    return t.input + t.output;
  }

  getCacheStats(): CacheStats {
    return {
      cacheCreationTokens: this.records.reduce((s, r) => s + r.cacheCreationTokens, 0),
      cacheReadTokens: this.records.reduce((s, r) => s + r.cacheReadTokens, 0),
      cacheCostSavings: this.records.reduce((s, r) => s + r.cacheCostSavings, 0),
    };
  }

  getRecords(): UsageRecord[] {
    return [...this.records];
  }

  getSummary(includeCacheDetails: boolean = false): string {
    const tokens = this.getSessionTokens();
    const cost = this.getSessionCost();
    const cache = this.getCacheStats();
    const lines: string[] = [
      `Total input tokens:  ${tokens.input.toLocaleString()}`,
      `Total output tokens: ${tokens.output.toLocaleString()}`,
      `Total tokens:        ${(tokens.input + tokens.output).toLocaleString()}`,
      `Estimated cost:      $${cost.toFixed(4)}`,
      `API calls:           ${this.records.length}`,
    ];

    if (includeCacheDetails && (cache.cacheReadTokens > 0 || cache.cacheCreationTokens > 0)) {
      const hitRate = tokens.input > 0
        ? ((cache.cacheReadTokens / tokens.input) * 100).toFixed(1)
        : '0.0';
      lines.push('');
      lines.push(`Cache writes:       ${cache.cacheCreationTokens.toLocaleString()} tokens`);
      lines.push(`Cache reads:        ${cache.cacheReadTokens.toLocaleString()} tokens (${hitRate}% hit rate)`);
      lines.push(`Cache savings:      $${cache.cacheCostSavings.toFixed(4)}`);
      lines.push(`Effective cost:     $${(cost - cache.cacheCostSavings).toFixed(4)}`);
    }

    if (this.records.length > 0) {
      const byModel = new Map<string, { input: number; output: number; cost: number }>();
      for (const r of this.records) {
        const m = byModel.get(r.model) || { input: 0, output: 0, cost: 0 };
        m.input += r.inputTokens;
        m.output += r.outputTokens;
        m.cost += r.cost;
        byModel.set(r.model, m);
      }

      lines.push('', 'By model:');
      for (const [model, stats] of byModel) {
        lines.push(`  ${model}: $${stats.cost.toFixed(4)} (${(stats.input + stats.output).toLocaleString()} tokens)`);
      }
    }

    return lines.join('\n');
  }

  reset(): void {
    this.records = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export const costTracker = new CostTracker();
