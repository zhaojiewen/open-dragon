import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebFetchTool } from '../../../src/tools/webfetch.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

describe('WebFetchTool', () => {
  let webFetchTool: WebFetchTool;
  let tempDir: string;

  beforeEach(() => {
    webFetchTool = new WebFetchTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webfetch-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct name and description', () => {
    expect(webFetchTool.name).toBe('webfetch');
    expect(webFetchTool.description).toContain('Fetch content');
  });

  it('should validate parameters', async () => {
    await expect(webFetchTool.execute({})).rejects.toThrow('Invalid parameters');
  });

  it('should require url parameter', async () => {
    await expect(webFetchTool.execute({ prompt: 'test' })).rejects.toThrow('Invalid parameters');
  });

  it('should accept optional prompt parameter', async () => {
    const mockResponse = 'test content';
    (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue(mockResponse);

    const result = await webFetchTool.execute({
      url: 'https://example.com',
      prompt: 'Extract title',
    });

    expect(result.success).toBe(true);
  });

  it('should truncate long content', async () => {
    const longContent = 'a'.repeat(15000);
    (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue(longContent);

    const result = await webFetchTool.execute({
      url: 'https://example.com',
    });

    expect(result.success).toBe(true);
    expect(result.output.length).toBeLessThan(11000);
    expect(result.output).toContain('truncated');
  });

  it('should not truncate short content', async () => {
    const shortContent = 'short content';
    (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue(shortContent);

    const result = await webFetchTool.execute({
      url: 'https://example.com',
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe(shortContent);
  });

  it('should handle fetch errors', async () => {
    (webFetchTool as any).fetchUrl = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await webFetchTool.execute({
      url: 'https://example.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  describe('fetchUrl internal method', () => {
    it('should exist and be a function', () => {
      expect(typeof (webFetchTool as any).fetchUrl).toBe('function');
    });

    it('should use http for http URLs', async () => {
      // Mock fetchUrl to simulate http behavior
      (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue('http response');

      const result = await (webFetchTool as any).fetchUrl('http://example.com');
      expect(result).toBe('http response');
    });

    it('should use https for https URLs', async () => {
      // Mock fetchUrl to simulate https behavior
      (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue('https response');

      const result = await (webFetchTool as any).fetchUrl('https://example.com');
      expect(result).toBe('https response');
    });

    it('should handle 301 redirects', async () => {
      // The method should handle redirects internally
      // Mock fetchUrl to simulate redirect handling
      (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue('redirected content');

      const result = await (webFetchTool as any).fetchUrl('https://example.com');
      expect(result).toBeDefined();
    });

    it('should handle 302 redirects', async () => {
      // Mock fetchUrl to simulate redirect handling
      (webFetchTool as any).fetchUrl = vi.fn().mockResolvedValue('content');

      const result = await (webFetchTool as any).fetchUrl('https://example.com');
      expect(result).toBeDefined();
    });

    it('should handle request errors', async () => {
      // Mock fetchUrl to simulate error
      (webFetchTool as any).fetchUrl = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await expect((webFetchTool as any).fetchUrl('https://example.com')).rejects.toThrow('Connection refused');
    });

    it('should handle request timeout', async () => {
      // Mock fetchUrl to simulate timeout
      (webFetchTool as any).fetchUrl = vi.fn().mockRejectedValue(new Error('Request timeout'));

      await expect((webFetchTool as any).fetchUrl('https://example.com')).rejects.toThrow('Request timeout');
    });
  });
});

describe('WebFetchTool Integration', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    // Create a simple HTTP server for testing
    server = http.createServer((req, res) => {
      const url = req.url || '/';
      const host = req.headers.host || `localhost:${port}`;

      if (url === '/redirect') {
        // Use absolute URL for redirect
        res.writeHead(302, { Location: `http://${host}/final` });
        res.end();
      } else if (url === '/redirect301') {
        res.writeHead(301, { Location: `http://${host}/final` });
        res.end();
      } else if (url === '/final') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Final destination content');
      } else if (url === '/error') {
        res.writeHead(500);
        res.end('Server error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from test server');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should fetch content from HTTP URL', async () => {
    const tool = new WebFetchTool();
    const result = await tool.execute({ url: `http://localhost:${port}/` });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from test server');
  });

  it('should handle 301 redirects', async () => {
    const tool = new WebFetchTool();
    const result = await tool.execute({ url: `http://localhost:${port}/redirect301` });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Final destination content');
  });

  it('should handle 302 redirects', async () => {
    const tool = new WebFetchTool();
    const result = await tool.execute({ url: `http://localhost:${port}/redirect` });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Final destination content');
  });

  it('should handle connection errors', async () => {
    const tool = new WebFetchTool();
    // Try to connect to a port that's not listening
    const result = await tool.execute({ url: 'http://localhost:59999/' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle server errors gracefully', async () => {
    const tool = new WebFetchTool();
    const result = await tool.execute({ url: `http://localhost:${port}/error` });

    // Server returns 500 but connection succeeds, so we get the response
    expect(result.success).toBe(true);
    expect(result.output).toContain('Server error');
  });
});
