import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadTool } from '../../../src/tools/read.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ReadTool', () => {
  let readTool: ReadTool;
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    readTool = new ReadTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-test-'));
    testFile = path.join(tempDir, 'test.txt');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct name and description', () => {
    expect(readTool.name).toBe('read');
    expect(readTool.description).toContain('Read a file');
  });

  it('should read a file successfully', async () => {
    const content = 'Hello\nWorld\nTest';
    fs.writeFileSync(testFile, content);

    const result = await readTool.execute({ file_path: testFile });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello');
    expect(result.output).toContain('World');
  });

  it('should fail if file does not exist', async () => {
    const result = await readTool.execute({ file_path: '/nonexistent/file.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('File not found');
  });

  it('should fail if path is a directory', async () => {
    const result = await readTool.execute({ file_path: tempDir });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Path is a directory');
  });

  it('should read with offset and limit', async () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    fs.writeFileSync(testFile, content);

    const result = await readTool.execute({
      file_path: testFile,
      offset: 1,
      limit: 2,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Line 2');
    expect(result.output).toContain('Line 3');
    expect(result.output).not.toContain('Line 1');
    expect(result.output).not.toContain('Line 4');
  });

  it('should handle relative paths with workingDirectory', async () => {
    const relativePath = 'test.txt';
    const content = 'Test content';
    fs.writeFileSync(testFile, content);

    const result = await readTool.execute(
      { file_path: relativePath },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Test content');
  });

  it('should include line numbers in output', async () => {
    const content = 'First line\nSecond line';
    fs.writeFileSync(testFile, content);

    const result = await readTool.execute({ file_path: testFile });

    expect(result.success).toBe(true);
    expect(result.output).toMatch(/1\tFirst line/);
    expect(result.output).toMatch(/2\tSecond line/);
  });

  it('should validate parameters', async () => {
    await expect(
      readTool.execute({})
    ).rejects.toThrow('Invalid parameters');
  });

  it('should handle read errors gracefully', async () => {
    fs.writeFileSync(testFile, 'test content');

    // Mock fs.readFileSync to throw an error
    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await readTool.execute({ file_path: testFile });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');

    readFileSyncSpy.mockRestore();
  });
});
