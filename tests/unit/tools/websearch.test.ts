import { describe, it, expect, beforeEach } from 'vitest';
import { WebSearchTool } from '../../../src/tools/websearch.js';

describe('WebSearchTool', () => {
  let webSearchTool: WebSearchTool;

  beforeEach(() => {
    webSearchTool = new WebSearchTool();
  });

  it('should have correct name and description', () => {
    expect(webSearchTool.name).toBe('websearch');
    expect(webSearchTool.description).toContain('Search the web');
  });

  it('should validate parameters', async () => {
    await expect(webSearchTool.execute({})).rejects.toThrow('Invalid parameters');
  });

  it('should require query parameter', async () => {
    await expect(webSearchTool.execute({ num_results: 5 })).rejects.toThrow('Invalid parameters');
  });

  it('should return error message for unconfigured API', async () => {
    const result = await webSearchTool.execute({
      query: 'test search',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should include query in error message', async () => {
    const result = await webSearchTool.execute({
      query: 'my search query',
    });

    expect(result.output).toContain('my search query');
  });

  it('should list available APIs in error message', async () => {
    const result = await webSearchTool.execute({
      query: 'test',
    });

    expect(result.output).toContain('Google Custom Search');
    expect(result.output).toContain('Bing Search');
    expect(result.output).toContain('Tavily');
    expect(result.output).toContain('Serper');
  });

  it('should accept optional num_results parameter', async () => {
    const result = await webSearchTool.execute({
      query: 'test',
      num_results: 10,
    });

    expect(result.success).toBe(false); // Still false because API not configured
  });
});
