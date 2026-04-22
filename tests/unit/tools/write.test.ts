import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WriteTool } from '../../../src/tools/write.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WriteTool', () => {
  let writeTool: WriteTool;
  let tempDir: string;

  beforeEach(() => {
    writeTool = new WriteTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have correct name and description', () => {
    expect(writeTool.name).toBe('write');
    expect(writeTool.description).toContain('Write content to a file');
  });

  it('should write to a new file', async () => {
    const filePath = path.join(tempDir, 'new-file.txt');
    const content = 'Hello, World!';

    const result = await writeTool.execute({
      file_path: filePath,
      content,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Successfully wrote');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should overwrite an existing file', async () => {
    const filePath = path.join(tempDir, 'existing-file.txt');
    fs.writeFileSync(filePath, 'Old content');

    const result = await writeTool.execute({
      file_path: filePath,
      content: 'New content',
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('New content');
  });

  it('should create nested directories if needed', async () => {
    const filePath = path.join(tempDir, 'subdir1', 'subdir2', 'file.txt');
    const content = 'Nested content';

    const result = await writeTool.execute({
      file_path: filePath,
      content,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should handle relative paths with workingDirectory', async () => {
    const relativePath = 'relative-file.txt';
    const content = 'Relative content';

    const result = await writeTool.execute(
      { file_path: relativePath, content },
      { workingDirectory: tempDir }
    );

    const expectedPath = path.join(tempDir, relativePath);
    expect(result.success).toBe(true);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('should report character count in output', async () => {
    const filePath = path.join(tempDir, 'count.txt');
    const content = '1234567890'; // 10 chars

    const result = await writeTool.execute({
      file_path: filePath,
      content,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('10 characters');
  });

  it('should validate required parameters', async () => {
    await expect(
      writeTool.execute({ file_path: '/tmp/test.txt' })
    ).rejects.toThrow('Invalid parameters');
  });

  it('should handle empty content', async () => {
    const filePath = path.join(tempDir, 'empty.txt');

    const result = await writeTool.execute({
      file_path: filePath,
      content: '',
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
  });
});
