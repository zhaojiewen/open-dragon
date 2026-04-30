import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentTool } from '../../../src/tools/agent.js';
import { AIProvider, Message, AIResponse } from '../../../src/providers/base.js';

// Create a mock provider
class MockProvider implements AIProvider {
  readonly name = 'mock';
  chat = vi.fn();
  stream = vi.fn();
  listModels = vi.fn(async () => ['mock-model']);
  getDefaultModel = vi.fn(() => 'mock-model');
}

describe('AgentTool', () => {
  let agentTool: AgentTool;
  let mockProvider: MockProvider;

  beforeEach(() => {
    agentTool = new AgentTool();
    mockProvider = new MockProvider();
    vi.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(agentTool.name).toBe('agent');
    expect(agentTool.description).toContain('sub-agent');
  });

  it('should validate parameters', async () => {
    await expect(agentTool.execute({})).rejects.toThrow('Invalid parameters');
  });

  it('should require description parameter', async () => {
    await expect(agentTool.execute({ prompt: 'test' })).rejects.toThrow('Invalid parameters');
  });

  it('should require prompt parameter', async () => {
    await expect(agentTool.execute({ description: 'test' })).rejects.toThrow('Invalid parameters');
  });

  it('should return error when no provider configured', async () => {
    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No provider');
    expect(result.output).toContain('not configured');
  });

  it('should execute single turn successfully', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Task completed successfully',
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Say hello',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Task completed successfully');
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('should include working directory in system prompt', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Done',
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    await agentTool.execute(
      {
        description: 'Test task',
        prompt: 'Do something',
      },
      { workingDirectory: '/test/path' }
    );

    const callArgs = mockProvider.chat.mock.calls[0];
    const messages = callArgs[0] as Message[];

    expect(messages[0].role).toBe('system');
    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('/test/path');
  });

  it('should handle provider errors', async () => {
    mockProvider.chat.mockRejectedValueOnce(new Error('Provider failed'));

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Provider failed');
  });

  it('should return default message when content is empty', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: '',
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('completed task without output');
  });

  it('should accept optional model parameter', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Done',
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
      model: 'claude-haiku-4-5',
    });

    const callArgs = mockProvider.chat.mock.calls[0];
    const options = callArgs[2];

    expect(options?.model).toBe('claude-haiku-4-5');
  });

  it('should handle multiple turns until end_turn', async () => {
    // First turn: tool_use
    mockProvider.chat.mockResolvedValueOnce({
      content: '',
      stopReason: 'tool_use',
      toolCalls: [{ id: '1', name: 'bash', arguments: { command: 'ls' } }],
    });

    // Second turn: end_turn
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Final result',
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Final result');
  });

  it('should reach max turns limit', async () => {
    // Always return tool_use to trigger max turns
    mockProvider.chat.mockResolvedValue({
      content: '',
      stopReason: 'tool_use',
      toolCalls: [{ id: '1', name: 'bash', arguments: {} }],
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('max turns');
    expect(mockProvider.chat).toHaveBeenCalledTimes(5); // maxTurns = 5
  });

  it('should stop when no tool calls returned', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: 'No tools needed',
      stopReason: 'end_turn',
      toolCalls: undefined,
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No tools needed');
  });

  it('should handle response with no content', async () => {
    mockProvider.chat.mockResolvedValueOnce({
      content: undefined as any,
      stopReason: 'end_turn',
    });

    agentTool.setProvider(mockProvider);

    const result = await agentTool.execute({
      description: 'Test task',
      prompt: 'Do something',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('completed task without output');
  });
});
