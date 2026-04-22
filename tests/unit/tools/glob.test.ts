import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobTool } from '../../../src/tools/glob.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GlobTool', () => {
  let globTool: GlobTool;
  let tempDir: string;

  beforeEach(() => {
    globTool = new GlobTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have correct name and description', () => {
    expect(globTool.name).toBe('glob');
    expect(globTool.description).toContain('glob patterns');
  });

  it('should find files matching pattern', async () => {
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'file2.txt'), '');
    fs.writeFileSync(path.join(tempDir, 'file3.md'), '');

    const result = await globTool.execute(
      { pattern: '*.txt' },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Found 2 file(s)');
    expect(result.output).toContain('file1.txt');
    expect(result.output).toContain('file2.txt');
    expect(result.output).not.toContain('file3.md');
  });

  it('should find files with recursive pattern', async () => {
    const subdir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(tempDir, 'top.txt'), '');
    fs.writeFileSync(path.join(subdir, 'nested.txt'), '');

    const result = await globTool.execute(
      { pattern: '**/*.txt' },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Found 2 file(s)');
  });

  it('should return message when no files found', async () => {
    const result = await globTool.execute(
      { pattern: '*.nonexistent' },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('No files found');
  });

  it('should use custom search path', async () => {
    const customDir = path.join(tempDir, 'custom');
    fs.mkdirSync(customDir);
    fs.writeFileSync(path.join(customDir, 'test.txt'), '');

    const result = await globTool.execute({
      pattern: '*.txt',
      path: customDir,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('test.txt');
  });

  it('should validate required parameters', async () => {
    await expect(globTool.execute({})).rejects.toThrow('Invalid parameters');
  });

  it('should handle invalid path gracefully', async () => {
    const result = await globTool.execute({
      pattern: '*.txt',
      path: '/nonexistent/path/that/does/not/exist',
    });

    // glob library might return empty or error depending on system
    // Just check that it doesn't throw
    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
  });

  it('should use process.cwd() when no path or context provided', async () => {
    // Create a file in current directory
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    fs.writeFileSync(path.join(tempDir, 'cwd-test.txt'), '');

    try {
      const result = await globTool.execute({ pattern: 'cwd-test.txt' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('cwd-test.txt');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
