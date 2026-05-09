import { describe, it, expect, beforeEach } from 'vitest';
import {
  HistoryCompactor,
  estimateTokenCount,
  type CompactionResult,
} from '../../../src/utils/history-compactor.js';
import type { Message, AIProvider, StreamChunk } from '../../../src/providers/base.js';

// Mock provider for testing
class MockProvider implements AIProvider {
  readonly name = 'mock';

  async chat() {
    return {
      content: 'test response',
      stopReason: 'end_turn',
    };
  }

  async *stream(): AsyncGenerator<StreamChunk> {
    yield { type: 'text', text: 'Summary of conversation history...' };
  }

  async listModels(): Promise<string[]> {
    return ['mock-model'];
  }

  getDefaultModel(): string {
    return 'mock-model';
  }
}

// Helper to create test messages
function createMessage(role: Message['role'], content: string | Message['content']): Message {
  return { role, content };
}

// Helper to create long message to exceed token threshold
function createLongMessage(length: number): string {
  return 'x'.repeat(length);
}

describe('estimateTokenCount', () => {
  it('should estimate tokens from string content', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello world' }, // 11 chars -> 3 tokens
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBe(3); // Math.ceil(11/4) = 3
  });

  it('should estimate tokens from array content', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: '1', name: 'bash', input: { command: 'ls' } },
        ],
      },
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBeGreaterThan(0);
  });

  it('should handle empty messages array', () => {
    const count = estimateTokenCount([]);
    expect(count).toBe(0);
  });

  it('should handle messages with empty content', () => {
    const messages: Message[] = [
      { role: 'user', content: '' },
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBe(0);
  });

  it('should accumulate tokens from multiple messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }, // 5 chars -> 2 tokens
      { role: 'assistant', content: 'World' }, // 5 chars -> 2 tokens
      { role: 'user', content: 'Test' }, // 4 chars -> 1 token
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBe(5); // 2 + 2 + 1 = 5
  });

  it('should handle JSON stringified content for arrays', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Test message' }],
      },
    ];
    const count = estimateTokenCount(messages);
    // JSON.stringify will add quotes and structure characters
    expect(count).toBeGreaterThan(0);
  });

  it('should return 0 for negative results (edge case)', () => {
    // This tests the safeguard in the function
    // In practice this shouldn happen with valid content
    const messages: Message[] = [
      { role: 'user', content: '' },
      { role: 'assistant', content: '' },
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBe(0);
  });

  it('should handle large messages correctly', () => {
    const largeContent = createLongMessage(8000); // 8000 chars -> 2000 tokens
    const messages: Message[] = [
      { role: 'user', content: largeContent },
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBe(2000);
  });

  it('should handle mixed role messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'tool', content: 'Tool result', toolCallId: 'tool-1' },
    ];
    const count = estimateTokenCount(messages);
    expect(count).toBeGreaterThan(0);
  });

  it('should calculate ceiling of division', () => {
    // 4 chars -> 1 token
    // 5 chars -> 2 tokens (ceiling of 1.25)
    // 8 chars -> 2 tokens
    const messages1: Message[] = [{ role: 'user', content: 'xxxx' }];
    expect(estimateTokenCount(messages1)).toBe(1);

    const messages2: Message[] = [{ role: 'user', content: 'xxxxx' }];
    expect(estimateTokenCount(messages2)).toBe(2);

    const messages3: Message[] = [{ role: 'user', content: 'xxxxxxxx' }];
    expect(estimateTokenCount(messages3)).toBe(2);
  });
});

describe('HistoryCompactor', () => {
  let compactor: HistoryCompactor;
  let mockProvider: MockProvider;

  beforeEach(() => {
    compactor = new HistoryCompactor();
    mockProvider = new MockProvider();
  });

  describe('constructor', () => {
    it('should create compactor with default settings', () => {
      compactor = new HistoryCompactor();
      expect(compactor).toBeDefined();
    });

    it('should accept custom maxInputTokens', () => {
      compactor = new HistoryCompactor({ maxInputTokens: 100_000 });
      // Test through behavior - a message exceeding 100k tokens should need compaction
      const messages: Message[] = [
        { role: 'user', content: createLongMessage(400_000) },
      ];
      // With 400,000 chars = 100,000 tokens, but we only have 1 message
      // minMessagesToKeep is 20, so won need compaction for length
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should accept custom minMessagesToKeep', () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      // Create 10 messages - more than minMessagesToKeep (5)
      const messages: Message[] = Array(10).fill(null).map(() =>
        createMessage('user', createLongMessage(1000))
      );
      // 10 messages * 250 tokens = 2500 tokens, under default 180k threshold
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should accept both custom options', () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 10_000,
        minMessagesToKeep: 3,
      });
      expect(compactor).toBeDefined();
    });

    it('should use undefined options as defaults', () => {
      compactor = new HistoryCompactor({});
      expect(compactor).toBeDefined();
    });

    it('should handle partial options', () => {
      compactor = new HistoryCompactor({ maxInputTokens: 50_000 });
      expect(compactor).toBeDefined();

      compactor = new HistoryCompactor({ minMessagesToKeep: 10 });
      expect(compactor).toBeDefined();
    });
  });

  describe('needsCompaction', () => {
    it('should return false for empty messages', () => {
      const result = compactor.needsCompaction([]);
      expect(result).toBe(false);
    });

    it('should return false for messages under minMessagesToKeep', () => {
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should return false for messages at minMessagesToKeep threshold', () => {
      const messages: Message[] = Array(20).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should return false when tokens under threshold even with many messages', () => {
      const messages: Message[] = Array(100).fill(null).map((_, i) =>
        createMessage('user', `Short message ${i}`) // ~20 chars each -> 5 tokens
      );
      // 100 messages * 5 tokens = 500 tokens, well under 180k
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should return true when tokens exceed threshold', () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 1000,
        minMessagesToKeep: 5,
      });
      // Create 50 messages with 200 chars each (50 tokens per message = 2500 total)
      const messages: Message[] = Array(50).fill(null).map(() =>
        createMessage('user', createLongMessage(200))
      );
      expect(compactor.needsCompaction(messages)).toBe(true);
    });

    it('should return false for messages just below token threshold', () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 1000,
        minMessagesToKeep: 5,
      });
      // Create 30 messages with 100 chars each (25 tokens per message = 750 total)
      const messages: Message[] = Array(30).fill(null).map(() =>
        createMessage('user', createLongMessage(100))
      );
      expect(compactor.needsCompaction(messages)).toBe(false);
    });

    it('should correctly handle messages at exactly threshold', () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 1000,
        minMessagesToKeep: 5,
      });
      // 40 messages * 100 chars = 25 tokens per message = 1000 tokens exactly
      const messages: Message[] = Array(40).fill(null).map(() =>
        createMessage('user', createLongMessage(100))
      );
      expect(compactor.needsCompaction(messages)).toBe(false); // not > threshold
    });

    it('should use estimateTokenCount for calculation', () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 500,
        minMessagesToKeep: 5,
      });
      // Create messages that exceed threshold
      const messages: Message[] = Array(30).fill(null).map(() =>
        createMessage('user', createLongMessage(200)) // 50 tokens each
      );
      expect(compactor.needsCompaction(messages)).toBe(true);
    });
  });

  describe('compact', () => {
    it('should return unchanged messages when under minMessagesToKeep', async () => {
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(false);
      expect(result.originalCount).toBe(10);
      expect(result.compactedCount).toBe(10);
      expect(result.messages).toEqual(messages);
      expect(result.summary).toBeUndefined();
    });

    it('should return unchanged messages at minMessagesToKeep threshold', async () => {
      const messages: Message[] = Array(20).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(false);
      expect(result.originalCount).toBe(20);
      expect(result.compactedCount).toBe(20);
      expect(result.messages).toEqual(messages);
    });

    it('should compact messages when over minMessagesToKeep', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.originalCount).toBe(30);
      // Should have: 1 system summary + 5 recent messages = 6
      expect(result.compactedCount).toBe(6);
      expect(result.summary).toBeDefined();
    });

    it('should insert summary as system message', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('Conversation history summary');
    });

    it('should keep most recent messages intact', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      // Last 5 messages should be preserved
      expect(result.messages.slice(-5)).toEqual(messages.slice(-5));
    });

    it('should generate heuristic summary from old messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = [
        ...Array(20).fill(null).map((_, i) =>
          createMessage('user', `User request ${i}`)
        ),
        ...Array(5).fill(null).map((_, i) =>
          createMessage('assistant', `Response ${i}`)
        ),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('User requests');
    });

    it('should extract user messages in summary', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'First question'),
        createMessage('assistant', 'First response'),
        createMessage('user', 'Second question'),
        createMessage('assistant', 'Second response'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('First question');
    });

    it('should handle messages with array content', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Response text' },
            { type: 'tool_use', id: '1', name: 'bash', input: { command: 'ls' } },
          ],
        },
        createMessage('user', 'Next question'),
        createMessage('assistant', 'Next response'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should extract tool names from assistant messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '1', name: 'bash', input: {} },
            { type: 'tool_use', id: '2', name: 'read', input: {} },
          ],
        },
        createMessage('user', 'Question 1'),
        createMessage('assistant', 'Response 1'),
        createMessage('user', 'Question 2'),
        createMessage('assistant', 'Response 2'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('Tools used');
      expect(result.summary).toContain('bash');
      expect(result.summary).toContain('read');
    });

    it('should handle tool messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'Question 1'),
        createMessage('assistant', 'Response 1'),
        { role: 'tool', content: 'Tool result', toolCallId: 'tool-1' },
        createMessage('user', 'Question 2'),
        createMessage('assistant', 'Response 2'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should truncate long user messages in summary', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const longContent = createLongMessage(500);
      const messages: Message[] = [
        createMessage('user', longContent),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toBeDefined();
      // Summary should truncate at 200 chars
      expect(result.summary!.length).toBeLessThan(longContent.length + 100);
    });

    it('should show ellipsis for truncated messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const longContent = createLongMessage(300);
      const messages: Message[] = [
        createMessage('user', longContent),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('...');
    });

    it('should handle many user messages with overflow', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `User message number ${i}`)
      );
      const result = await compactor.compact(messages);

      // Should show first 5 user messages, then "... (X more messages)"
      expect(result.summary).toBeDefined();
    });

    it('should include count of compacted messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('Messages compacted');
      expect(result.summary).toContain('25'); // 30 - 5 = 25 compacted
    });

    it('should work without provider', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should accept provider parameter', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages, mockProvider);

      expect(result.wasCompacted).toBe(true);
      // Provider is optional and not used in current implementation
    });

    it('should accept model parameter', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages, mockProvider, 'custom-model');

      expect(result.wasCompacted).toBe(true);
      // Model is optional and not used in current implementation
    });

    it('should handle messages with only assistant messages', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('assistant', `Response ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
      // No user messages, so summary won have "User requests" section
    });

    it('should handle messages with only non-string user content', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Text content' },
            { type: 'tool_result', toolUseId: '1', content: 'Result' },
          ],
        },
        createMessage('assistant', 'Response 1'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      // Non-string user messages are filtered out in summary
    });

    it('should preserve correct split point', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 10 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Unique message content ${i}`)
      );
      const result = await compactor.compact(messages);

      // Verify split point: 30 - 10 = 20
      expect(result.originalCount).toBe(30);
      expect(result.compactedCount).toBe(11); // 1 summary + 10 recent
      // Last 10 messages should match exactly
      const recentMessages = messages.slice(-10);
      expect(result.messages.slice(-10)).toEqual(recentMessages);
    });

    it('should handle CompactionResult interface correctly', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(30).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result: CompactionResult = await compactor.compact(messages);

      // Verify all CompactionResult fields
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(typeof result.wasCompacted).toBe('boolean');
      expect(typeof result.originalCount).toBe('number');
      expect(typeof result.compactedCount).toBe('number');
      if (result.summary !== undefined) {
        expect(typeof result.summary).toBe('string');
      }
    });
  });

  describe('buildHeuristicSummary (via compact)', () => {
    it('should summarize user requests', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'What is the weather?'),
        createMessage('assistant', 'Weather response'),
        createMessage('user', 'Tell me about stocks'),
        createMessage('assistant', 'Stocks response'),
        createMessage('user', 'Recent question'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('User requests');
      expect(result.summary).toContain('What is the weather?');
      expect(result.summary).toContain('Tell me about stocks');
    });

    it('should list tools used', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check' },
            { type: 'tool_use', id: '1', name: 'bash', input: {} },
            { type: 'tool_use', id: '2', name: 'read', input: {} },
            { type: 'tool_use', id: '3', name: 'write', input: {} },
          ],
        },
        createMessage('user', 'Question'),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).toContain('Tools used');
      expect(result.summary).toContain('bash');
      expect(result.summary).toContain('read');
      expect(result.summary).toContain('write');
    });

    it('should not include tools section when no tools used', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'Question 1'),
        createMessage('assistant', 'Response 1'),
        createMessage('user', 'Question 2'),
        createMessage('assistant', 'Response 2'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.summary).not.toContain('Tools used');
    });

    it('should handle unique tool names (Set behavior)', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '1', name: 'bash', input: {} },
            { type: 'tool_use', id: '2', name: 'bash', input: {} },
            { type: 'tool_use', id: '3', name: 'bash', input: {} },
          ],
        },
        createMessage('user', 'Question'),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      // bash should appear only once
      const bashMatches = result.summary!.match(/bash/g);
      expect(bashMatches).toHaveLength(1);
    });

    it('should count messages compacted correctly', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = Array(25).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      // 25 messages - 5 kept = 20 compacted
      expect(result.summary).toContain('20');
    });

    it('should limit displayed user messages to 5', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(20).fill(null).map((_, i) =>
        createMessage('user', `Question ${i}`)
      );
      const result = await compactor.compact(messages);

      // Should show "more messages" indicator
      expect(result.summary).toContain('more messages');
    });
  });

  describe('edge cases', () => {
    it('should handle single message under threshold', async () => {
      const messages: Message[] = [createMessage('user', 'Hello')];
      const result = await compactor.needsCompaction(messages);
      expect(result).toBe(false);
    });

    it('should handle empty message content', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', ''),
        createMessage('assistant', ''),
        createMessage('user', ''),
        createMessage('assistant', ''),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should handle very small minMessagesToKeep', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 1 });
      const messages: Message[] = Array(5).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.compactedCount).toBe(2); // 1 summary + 1 recent message
    });

    it('should handle large minMessagesToKeep', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 100 });
      const messages: Message[] = Array(50).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(false);
      expect(result.originalCount).toBe(50);
      expect(result.compactedCount).toBe(50);
    });

    it('should handle mixed message types in compaction', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages: Message[] = [
        createMessage('system', 'System instruction'),
        ...Array(20).fill(null).flatMap((_, i) => [
          createMessage('user', `Question ${i}`),
          createMessage('assistant', `Answer ${i}`),
        ]),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('Conversation history summary');
    });

    it('should handle tool_result content blocks', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'Question'),
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Response' },
            { type: 'tool_use', id: '1', name: 'bash', input: {} },
          ],
        },
        { role: 'tool', content: 'Tool output', toolCallId: '1' },
        createMessage('user', 'Follow up'),
        createMessage('assistant', 'Follow up response'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toContain('bash');
    });

    it('should handle provider with error', async () => {
      // Create a provider that throws error (but compactor doesn use provider currently)
      class ErrorProvider implements AIProvider {
        readonly name = 'error';
        async chat() {
          throw new Error('Provider error');
        }
        async *stream(): AsyncGenerator<StreamChunk> {
          throw new Error('Stream error');
        }
        async listModels(): Promise<string[]> {
          return ['error-model'];
        }
        getDefaultModel(): string {
          return 'error-model';
        }
      }

      const errorProvider = new ErrorProvider();
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = Array(10).fill(null).map((_, i) =>
        createMessage('user', `Message ${i}`)
      );

      // Should not throw because provider is not used
      const result = await compactor.compact(messages, errorProvider);
      expect(result.wasCompacted).toBe(true);
    });

    it('should handle concurrent compaction calls', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
      const messages1: Message[] = Array(20).fill(null).map((_, i) =>
        createMessage('user', `Set 1 Message ${i}`)
      );
      const messages2: Message[] = Array(25).fill(null).map((_, i) =>
        createMessage('user', `Set 2 Message ${i}`)
      );

      const [result1, result2] = await Promise.all([
        compactor.compact(messages1),
        compactor.compact(messages2),
      ]);

      expect(result1.wasCompacted).toBe(true);
      expect(result1.originalCount).toBe(20);
      expect(result2.wasCompacted).toBe(true);
      expect(result2.originalCount).toBe(25);
    });

    it('should handle messages with special characters', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        createMessage('user', 'Hello \n\t\r World'),
        createMessage('assistant', 'Response with unicode: \u{1F600}'),
        createMessage('user', 'Question with "quotes" and \'apostrophes\''),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toBeDefined();
    });

    it('should handle messages with only tool_use content', async () => {
      compactor = new HistoryCompactor({ minMessagesToKeep: 3 });
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '1', name: 'bash', input: {} },
          ],
        },
        createMessage('user', 'Question'),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Recent'),
        createMessage('assistant', 'Recent response'),
      ];
      const result = await compactor.compact(messages);

      expect(result.wasCompacted).toBe(true);
      expect(result.summary).toContain('bash');
    });
  });

  describe('integration scenarios', () => {
    it('should simulate typical conversation compaction', async () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 5000,
        minMessagesToKeep: 10,
      });

      // Simulate a typical conversation
      const messages: Message[] = [
        createMessage('system', 'You are a helpful assistant'),
        createMessage('user', 'What files are in this directory?'),
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check' },
            { type: 'tool_use', id: '1', name: 'bash', input: { command: 'ls -la' } },
          ],
        },
        { role: 'tool', content: 'file1.txt file2.txt', toolCallId: '1' },
        createMessage('user', 'Read file1.txt'),
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '2', name: 'read', input: { path: 'file1.txt' } },
          ],
        },
        { role: 'tool', content: 'Content of file1', toolCallId: '2' },
        createMessage('user', 'Now edit file1.txt'),
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '3', name: 'edit', input: { path: 'file1.txt' } },
          ],
        },
        { role: 'tool', content: 'File edited', toolCallId: '3' },
        createMessage('user', 'What about file2?'),
        createMessage('assistant', 'Checking file2'),
        createMessage('user', 'Current question'),
        createMessage('assistant', 'Current response'),
      ];

      const needsCompact = compactor.needsCompaction(messages);
      const result = await compactor.compact(messages);

      // Depending on message size, may or may not need compaction
      expect(result.originalCount).toBe(messages.length);
      expect(result.messages).toBeDefined();
    });

    it('should handle long-running conversation', async () => {
      compactor = new HistoryCompactor({
        maxInputTokens: 2000,
        minMessagesToKeep: 20,
      });

      // Simulate long conversation with many messages
      const messages: Message[] = Array(100).fill(null).flatMap((_, i) => [
        createMessage('user', `User question number ${i} with some additional context`),
        createMessage('assistant', `Assistant response number ${i} with detailed explanation`),
      ]);

      const needsCompact = compactor.needsCompaction(messages);
      expect(needsCompact).toBe(true);

      const result = await compactor.compact(messages);
      expect(result.wasCompacted).toBe(true);
      expect(result.compactedCount).toBe(21); // 1 summary + 20 kept
    });
  });
});

describe('CompactionResult interface', () => {
  it('should have correct structure when compacted', async () => {
    const compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
    const messages: Message[] = Array(30).fill(null).map((_, i) =>
      createMessage('user', `Message ${i}`)
    );
    const result = await compactor.compact(messages);

    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('wasCompacted');
    expect(result).toHaveProperty('originalCount');
    expect(result).toHaveProperty('compactedCount');
    expect(result).toHaveProperty('summary');
  });

  it('should have correct structure when not compacted', async () => {
    const compactor = new HistoryCompactor({ minMessagesToKeep: 5 });
    const messages: Message[] = Array(3).fill(null).map((_, i) =>
      createMessage('user', `Message ${i}`)
    );
    const result = await compactor.compact(messages);

    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('wasCompacted');
    expect(result).toHaveProperty('originalCount');
    expect(result).toHaveProperty('compactedCount');
    expect(result.summary).toBeUndefined();
  });
});