import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditTool } from '../../../src/tools/edit.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('EditTool', () => {
  let editTool: EditTool;
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    editTool = new EditTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-test-'));
    testFile = path.join(tempDir, 'test.txt');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have correct name and description', () => {
    expect(editTool.name).toBe('edit');
    expect(editTool.description).toContain('exact string replacements');
  });

  it('should replace a single occurrence', async () => {
    fs.writeFileSync(testFile, 'Hello old world');

    const result = await editTool.execute({
      file_path: testFile,
      old_string: 'old',
      new_string: 'new',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Successfully replaced 1 occurrence');
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('Hello new world');
  });

  it('should replace all occurrences with replace_all flag', async () => {
    fs.writeFileSync(testFile, 'old old old');

    const result = await editTool.execute({
      file_path: testFile,
      old_string: 'old',
      new_string: 'new',
      replace_all: true,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Successfully replaced 3 occurrence');
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('new new new');
  });

  it('should fail if string not found', async () => {
    fs.writeFileSync(testFile, 'Hello world');

    const result = await editTool.execute({
      file_path: testFile,
      old_string: 'notpresent',
      new_string: 'replacement',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('String not found');
  });

  it('should fail if file does not exist', async () => {
    const result = await editTool.execute({
      file_path: '/nonexistent/file.txt',
      old_string: 'old',
      new_string: 'new',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('File not found');
  });

  it('should fail on multiple occurrences without replace_all', async () => {
    fs.writeFileSync(testFile, 'old old');

    const result = await editTool.execute({
      file_path: testFile,
      old_string: 'old',
      new_string: 'new',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Multiple occurrences found');
    expect(result.output).toContain('Found 2 occurrences');
  });

  it('should handle relative paths with workingDirectory', async () => {
    const relativePath = 'test.txt';
    fs.writeFileSync(testFile, 'Hello world');

    const result = await editTool.execute(
      {
        file_path: relativePath,
        old_string: 'world',
        new_string: 'universe',
      },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('Hello universe');
  });

  it('should validate required parameters', async () => {
    await expect(
      editTool.execute({ file_path: testFile })
    ).rejects.toThrow('Invalid parameters');
  });
});
