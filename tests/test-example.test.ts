/**
 * Test Example - How to write tests for OpenDragon
 * 
 * This file demonstrates the testing patterns used in this project.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Example: Testing Tools', () => {
  /**
   * Example 1: Testing a tool that creates files
   */
  describe('File Operations Example', () => {
    let tmpDir: string;

    // Setup: Create temporary directory before each test
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dragon-test-'));
    });

    // Cleanup: Remove temporary directory after each test
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should demonstrate file creation', async () => {
      const filePath = path.join(tmpDir, 'example.txt');
      const content = 'Hello, World!';
      
      // Write file
      fs.writeFileSync(filePath, content);
      
      // Verify file exists
      expect(fs.existsSync(filePath)).toBe(true);
      
      // Verify content
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    });

    it('should demonstrate file reading with offset', async () => {
      const filePath = path.join(tmpDir, 'multiline.txt');
      fs.writeFileSync(filePath, 'Line 1\nLine 2\nLine 3');
      
      // Read all lines
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      expect(lines.length).toBe(3);
      expect(lines[0]).toBe('Line 1');
    });
  });

  /**
   * Example 2: Testing async operations
   */
  describe('Async Operations Example', () => {
    it('should handle async operations', async () => {
      const result = await new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), 10);
      });
      
      expect(result).toBe('success');
    });

    it('should handle async errors', async () => {
      await expect(
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test error')), 10)
        )
      ).rejects.toThrow('Test error');
    });
  });

  /**
   * Example 3: Testing with mocks
   */
  describe('Mocking Example', () => {
    it('should mock console.log', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      console.log('test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('test message');
      
      consoleSpy.mockRestore();
    });

    it('should mock file system operations', () => {
      const fsMock = vi.fn();
      
      fsMock.mockReturnValue('mocked content');
      
      expect(fsMock()).toBe('mocked content');
      expect(fsMock).toHaveBeenCalled();
    });
  });
});

describe('Example: Testing Configuration', () => {
  /**
   * Example 4: Testing configuration validation
   */
  describe('Config Validation Example', () => {
    it('should validate required fields', () => {
      const config = {
        name: 'test',
        version: '1.0.0',
      };
      
      expect(config.name).toBeDefined();
      expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should apply default values', () => {
      const defaults = {
        timeout: 5000,
        retries: 3,
      };
      
      const userConfig = { timeout: 10000 };
      const config = { ...defaults, ...userConfig };
      
      expect(config.timeout).toBe(10000);
      expect(config.retries).toBe(3);
    });
  });
});

describe('Example: Testing Error Handling', () => {
  /**
   * Example 5: Testing error cases
   */
  describe('Error Cases Example', () => {
    it('should throw error for invalid input', () => {
      const validate = (value: any) => {
        if (!value) throw new Error('Value required');
        return true;
      };
      
      expect(() => validate(null)).toThrow('Value required');
    });

    it('should handle missing files gracefully', async () => {
      const filePath = '/nonexistent/path/to/file.txt';
      
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });
});

/**
 * Running this test file:
 * 
 * npm test tests/test-example.test.ts
 * 
 * Tips:
 * 1. Use beforeEach/afterEach for setup and cleanup
 * 2. Use vi.fn() for mocking functions
 * 3. Use vi.spyOn() to spy on existing functions
 * 4. Always restore mocks after tests
 * 5. Test both success and error cases
 * 6. Use descriptive test names
 */
