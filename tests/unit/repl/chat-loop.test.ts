import { describe, it, expect } from 'vitest';
import { extractPathsFromToolCall, isToolInWorkspace } from '../../../src/repl/chat-loop.js';

describe('Chat Loop Utilities', () => {
  describe('extractPathsFromToolCall', () => {
    it('should extract file_path from read tool', () => {
      const tc = {
        id: 'call_1',
        name: 'read',
        arguments: { file_path: '/src/index.ts' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual(['/src/index.ts']);
    });

    it('should extract file_path from write tool', () => {
      const tc = {
        id: 'call_2',
        name: 'write',
        arguments: { file_path: '/src/output.ts', content: 'test' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual(['/src/output.ts']);
    });

    it('should extract file_path from edit tool', () => {
      const tc = {
        id: 'call_3',
        name: 'edit',
        arguments: { file_path: '/src/config.ts', old_string: 'foo', new_string: 'bar' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual(['/src/config.ts']);
    });

    it('should extract absolute paths from bash command', () => {
      const tc = {
        id: 'call_4',
        name: 'bash',
        arguments: { command: 'cat /src/file.ts' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toContain('/src/file.ts');
    });

    it('should extract home-relative paths from bash command', () => {
      const tc = {
        id: 'call_5',
        name: 'bash',
        arguments: { command: 'ls ~/Documents' },
      };
      const paths = extractPathsFromToolCall(tc);
      // The function extracts ~/Documents, not just ~
      expect(paths.some(p => p.startsWith('~'))).toBe(true);
    });

    it('should extract relative paths from bash command', () => {
      const tc = {
        id: 'call_6',
        name: 'bash',
        arguments: { command: 'npm run build && ./script.sh' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toContain('./script.sh');
    });

    it('should extract multiple paths from bash command', () => {
      const tc = {
        id: 'call_7',
        name: 'bash',
        arguments: { command: 'cp /src/a.ts /dest/b.ts' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract quoted paths from bash command', () => {
      const tc = {
        id: 'call_8',
        name: 'bash',
        arguments: { command: 'cat "/path/file.ts"' },
      };
      const paths = extractPathsFromToolCall(tc);
      // Quoted paths are extracted without the quotes
      expect(paths).toContain('/path/file.ts');
    });

    it('should return empty array for non-file tools', () => {
      const tc = {
        id: 'call_9',
        name: 'webfetch',
        arguments: { url: 'https://example.com' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual([]);
    });

    it('should return empty array when no file_path argument', () => {
      const tc = {
        id: 'call_10',
        name: 'read',
        arguments: {},
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual([]);
    });

    it('should handle filePath variant', () => {
      const tc = {
        id: 'call_11',
        name: 'read',
        arguments: { filePath: '/src/variant.ts' },
      };
      const paths = extractPathsFromToolCall(tc);
      expect(paths).toEqual(['/src/variant.ts']);
    });
  });

  describe('isToolInWorkspace', () => {
    it('should return true when no workspace configured', () => {
      const tc = {
        id: 'call_1',
        name: 'read',
        arguments: { file_path: '/any/path.ts' },
      };
      expect(isToolInWorkspace(tc, [])).toBe(true);
    });

    it('should return true when no file paths in tool call', () => {
      const tc = {
        id: 'call_2',
        name: 'bash',
        arguments: { command: 'npm test' },
      };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(true);
    });

    it('should return true for path within workspace', () => {
      const tc = {
        id: 'call_3',
        name: 'read',
        arguments: { file_path: '/workspace/src/file.ts' },
      };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(true);
    });

    it('should return false for path outside workspace', () => {
      const tc = {
        id: 'call_4',
        name: 'read',
        arguments: { file_path: '/outside/file.ts' },
      };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(false);
    });

    it('should handle multiple workspace paths', () => {
      const tc = {
        id: 'call_5',
        name: 'read',
        arguments: { file_path: '/project2/file.ts' },
      };
      expect(isToolInWorkspace(tc, ['/project1', '/project2'])).toBe(true);
    });

    it('should return false if any path is outside workspace', () => {
      const tc = {
        id: 'call_6',
        name: 'bash',
        arguments: { command: 'cp /workspace/a.ts /outside/b.ts' },
      };
      expect(isToolInWorkspace(tc, ['/workspace'])).toBe(false);
    });

    it('should handle home directory expansion', () => {
      const tc = {
        id: 'call_7',
        name: 'read',
        arguments: { file_path: '~/Documents/file.ts' },
      };
      // This will expand ~ to the actual home directory
      const result = isToolInWorkspace(tc, [process.env.HOME || '/home']);
      expect(result).toBe(true);
    });
  });
});