import type { Message } from '../providers/base.js';
import type { AIProvider } from '../providers/base.js';

export interface CompactionResult {
  messages: Message[];
  wasCompacted: boolean;
  summary?: string;
  originalCount: number;
  compactedCount: number;
}

/**
 * Estimates token count from message content using a rough heuristic.
 * Average English text: ~4 characters per token.
 */
export function estimateTokenCount(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    total += Math.ceil(content.length / 4);
  }
  return total < 0 ? 0 : total;
}

export class HistoryCompactor {
  private static readonly DEFAULT_MAX_INPUT_TOKENS = 180_000;
  private static readonly MIN_MESSAGES_TO_KEEP = 20;

  private maxInputTokens: number;
  private minMessagesToKeep: number;

  constructor(options?: {
    maxInputTokens?: number;
    minMessagesToKeep?: number;
  }) {
    this.maxInputTokens = options?.maxInputTokens ?? HistoryCompactor.DEFAULT_MAX_INPUT_TOKENS;
    this.minMessagesToKeep = options?.minMessagesToKeep ?? HistoryCompactor.MIN_MESSAGES_TO_KEEP;
  }

  needsCompaction(messages: Message[]): boolean {
    if (messages.length <= this.minMessagesToKeep) return false;
    const estimated = estimateTokenCount(messages);
    return estimated > this.maxInputTokens;
  }

  /**
   * Compact message history by summarizing older messages.
   *
   * Strategy:
   * 1. Keep the last `minMessagesToKeep` messages intact
   * 2. Summarize older user and assistant messages into a single summary
   * 3. If a provider is available, use it for the summary; otherwise use heuristic
   */
  async compact(
    messages: Message[],
    provider?: AIProvider,
    model?: string
  ): Promise<CompactionResult> {
    const originalCount = messages.length;

    if (messages.length <= this.minMessagesToKeep) {
      return { messages, wasCompacted: false, originalCount, compactedCount: originalCount };
    }

    const splitPoint = messages.length - this.minMessagesToKeep;
    const oldMessages = messages.slice(0, splitPoint);
    const recentMessages = messages.slice(splitPoint);

    // Build a heuristic summary from old messages
    const summary = this.buildHeuristicSummary(oldMessages);

    // Insert summary as a system message at the front of recent messages
    const compactedMessages: Message[] = [
      {
        role: 'system',
        content: `[Conversation history summary — earlier messages have been compacted to save tokens]\n\n${summary}`,
      },
      ...recentMessages,
    ];

    return {
      messages: compactedMessages,
      wasCompacted: true,
      summary,
      originalCount,
      compactedCount: compactedMessages.length,
    };
  }

  /**
   * Build a heuristic summary from old messages without making an API call.
   * Extracts user questions, key topics, and tool usage patterns.
   */
  private buildHeuristicSummary(messages: Message[]): string {
    const parts: string[] = [];

    // Extract user messages (questions/requests)
    const userMessages = messages
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => (m.content as string).substring(0, 200));

    // Track which tools were used
    const toolNames = new Set<string>();
    const filesRead = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.name) {
            toolNames.add(block.name);
          }
        }
      }
      if (msg.role === 'tool' && typeof msg.toolCallId === 'string') {
        // Can't easily extract file paths here, skip
      }
    }

    if (userMessages.length > 0) {
      parts.push(`User requests (${userMessages.length} total):`);
      // Show first few and last few user messages
      const showCount = Math.min(5, userMessages.length);
      for (let i = 0; i < showCount && i < userMessages.length; i++) {
        parts.push(`  ${i + 1}. ${userMessages[i]}${userMessages[i].length >= 200 ? '...' : ''}`);
      }
      if (userMessages.length > showCount) {
        parts.push(`  ... (${userMessages.length - showCount} more messages)`);
      }
    }

    if (toolNames.size > 0) {
      parts.push(`\nTools used: ${[...toolNames].join(', ')}`);
    }

    // Estimate conversation length
    parts.push(`\nMessages compacted: ${messages.length}`);

    return parts.join('\n');
  }
}
