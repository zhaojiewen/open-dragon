import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BashTool } from '../../../src/tools/bash.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('BashTool', () => {
  let bashTool: BashTool;
  let tempDir: string;

  beforeEach(() => {
    bashTool = new BashTool();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have correct name and description', () => {
    expect(bashTool.name).toBe('bash');
    expect(bashTool.description).toContain('Execute shell commands');
  });

  it('should execute a simple command', async () => {
    const result = await bashTool.execute({ command: 'echo "Hello, World!"' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello, World!');
  });

  it('should execute command with workingDirectory', async () => {
    const result = await bashTool.execute(
      { command: 'pwd' },
      { workingDirectory: tempDir }
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain(tempDir);
  });

  it('should capture stderr', async () => {
    const result = await bashTool.execute({
      command: 'echo "error message" >&2',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('error message');
  });

  it('should handle command failure', async () => {
    const result = await bashTool.execute({
      command: 'exit 1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle non-existent command', async () => {
    const result = await bashTool.execute({
      command: 'nonexistentcommand12345',
    });

    expect(result.success).toBe(false);
  });

  it('should support timeout parameter', async () => {
    const result = await bashTool.execute({
      command: 'echo "quick command"',
      timeout: 1000,
    });

    expect(result.success).toBe(true);
  }, 10000);

  it('should return success message for no output', async () => {
    const result = await bashTool.execute({
      command: 'true', // Command that succeeds with no output
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('no output');
  });

  it('should validate parameters', async () => {
    await expect(bashTool.execute({})).rejects.toThrow('Invalid parameters');
  });
});
