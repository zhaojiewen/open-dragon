import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrepTool } from '../../../src/tools/grep.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GrepTool', () => {
  let grepTool: GrepTool;
  let tempDir: string;

  beforeEach(() => {
    grepTool = new GrepTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grep-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have correct name and description', () => {
    expect(grepTool.name).toBe('grep');
    expect(grepTool.description).toContain('Search for patterns');
  });

  it('should search for pattern in files', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello world\nfoo bar\nhello again');

    const result = await grepTool.execute({
      pattern: 'hello',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello');
  });

  it('should return no matches found when pattern not found', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'foo bar');

    const result = await grepTool.execute({
      pattern: 'notexist',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found');
  });

  it('should support case-insensitive search', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'HELLO WORLD');

    const result = await grepTool.execute({
      pattern: 'hello',
      path: tempDir,
      ignore_case: true,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('HELLO');
  });

  it('should be case-sensitive by default', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'HELLO WORLD');

    const result = await grepTool.execute({
      pattern: 'hello',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found');
  });

  it('should support file pattern filtering', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.ts'), 'typescript content');
    fs.writeFileSync(path.join(tempDir, 'test.js'), 'javascript content');

    const result = await grepTool.execute({
      pattern: 'content',
      path: tempDir,
      file_pattern: '*.ts',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('test.ts');
    expect(result.output).not.toContain('test.js');
  });

  it('should use context working directory when path not provided', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test content');

    const result = await grepTool.execute(
      { pattern: 'test content' },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('test content');
  });

  it('should show line numbers in output', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'line1\nline2\nline3');

    const result = await grepTool.execute({
      pattern: 'line',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    // Format: path/to/file.txt:line_number:content
    expect(result.output).toMatch(/test\.txt:\d+:line/);
  });

  it('should search recursively in directories', async () => {
    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'nested content');

    const result = await grepTool.execute({
      pattern: 'nested',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('nested.txt');
  });

  it('should handle special characters in pattern', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test "quoted" text');

    const result = await grepTool.execute({
      pattern: '"quoted"',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('quoted');
  });

  it('should validate parameters', async () => {
    await expect(grepTool.execute({})).rejects.toThrow('Invalid parameters');
  });

  it('should handle invalid directory gracefully', async () => {
    const result = await grepTool.execute({
      pattern: 'test',
      path: '/nonexistent/directory/path',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should truncate output when too many results', async () => {
    // Create file with many matching lines
    const lines = [];
    for (let i = 0; i < 150; i++) {
      lines.push(`match line ${i}`);
    }
    fs.writeFileSync(path.join(tempDir, 'test.txt'), lines.join('\n'));

    const result = await grepTool.execute({
      pattern: 'match',
      path: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('truncated');
  });

  it('should use process.cwd() when no path or context provided', async () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    fs.writeFileSync(path.join(tempDir, 'cwd-test.txt'), 'cwd content');

    try {
      const result = await grepTool.execute({ pattern: 'cwd content' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('cwd content');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
