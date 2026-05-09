import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('EncryptionService pbkdf2 error handling', () => {
  let tempDir: string;
  let keyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encryption-pbkdf2-test-'));
    keyPath = path.join(tempDir, '.key');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('should handle pbkdf2 errors during key encryption', async () => {
    // Mock crypto with error behavior for this test
    vi.doMock('crypto', async () => {
      const actualCrypto = await vi.importActual('crypto');
      return {
        ...actualCrypto,
        pbkdf2: vi.fn().mockImplementation((password, salt, iterations, keylen, digest, callback) => {
          callback(new Error('PBKDF2 encryption error'), null);
        }),
      };
    });

    vi.doMock('../../../src/utils/logger.js', () => ({
      getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }));

    const { EncryptionService } = await import('../../../src/encryption/index.js');

    const encryption = new EncryptionService(keyPath);
    await expect(encryption.initialize('test-password')).rejects.toThrow('PBKDF2 encryption error');
  });

  it('should handle pbkdf2 errors during key decryption', async () => {
    // First, create an encrypted key file without error
    vi.doMock('crypto', async () => {
      const actualCrypto = await vi.importActual('crypto');
      return {
        ...actualCrypto,
        pbkdf2: vi.fn().mockImplementation((password, salt, iterations, keylen, digest, callback) => {
          (actualCrypto as any).pbkdf2(password, salt, iterations, keylen, digest, callback);
        }),
      };
    });

    vi.doMock('../../../src/utils/logger.js', () => ({
      getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }));

    const { EncryptionService: EncryptionService1 } = await import('../../../src/encryption/index.js');
    const encryption1 = new EncryptionService1(keyPath);
    await encryption1.initialize('correct-password');

    // Now mock crypto to throw error during decryption
    vi.resetModules();
    vi.doMock('crypto', async () => {
      const actualCrypto = await vi.importActual('crypto');
      return {
        ...actualCrypto,
        pbkdf2: vi.fn().mockImplementation((password, salt, iterations, keylen, digest, callback) => {
          callback(new Error('PBKDF2 decryption error'), null);
        }),
      };
    });

    vi.doMock('../../../src/utils/logger.js', () => ({
      getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }));

    const { EncryptionService: EncryptionService2 } = await import('../../../src/encryption/index.js');
    const encryption2 = new EncryptionService2(keyPath);
    await expect(encryption2.initialize('correct-password')).rejects.toThrow('PBKDF2 decryption error');
  });
});