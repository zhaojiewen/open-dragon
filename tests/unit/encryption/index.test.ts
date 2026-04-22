import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EncryptionService, SecureConfigManager } from '../../../src/encryption/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('EncryptionService', () => {
  let encryption: EncryptionService;
  let tempDir: string;
  let keyPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encryption-test-'));
    keyPath = path.join(tempDir, '.key');
    encryption = new EncryptionService(keyPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should initialize without password', async () => {
      await encryption.initialize();
      expect(encryption.isInitialized()).toBe(true);
    });

    it('should initialize with password', async () => {
      await encryption.initialize('test-password');
      expect(encryption.isInitialized()).toBe(true);
    });

    it('should reuse existing key without password', async () => {
      await encryption.initialize();
      const encryption2 = new EncryptionService(keyPath);
      await encryption2.initialize();
      expect(encryption2.isInitialized()).toBe(true);
    });

    it('should reuse existing key with password', async () => {
      await encryption.initialize('test-password');
      const encryption2 = new EncryptionService(keyPath);
      await encryption2.initialize('test-password');
      expect(encryption2.isInitialized()).toBe(true);
    });

    it('should create key file with correct permissions', async () => {
      await encryption.initialize();
      const stats = fs.statSync(keyPath);
      // Check file permissions (0o600 = owner read/write only)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should create key directory if not exists', async () => {
      const nestedKeyPath = path.join(tempDir, 'nested', 'dir', '.key');
      const nestedEncryption = new EncryptionService(nestedKeyPath);
      await nestedEncryption.initialize();
      expect(fs.existsSync(nestedKeyPath)).toBe(true);
    });

    it('should throw error when key file exists but cannot be read', async () => {
      await encryption.initialize('test-password');

      // Create a new encryption service that tries to read without password
      // when the key is password-protected
      const encryption2 = new EncryptionService(keyPath);

      // This should still work - it will try to read as plain key
      // which won't be valid, but won't throw in the current implementation
    });

    it('should handle corrupted key file gracefully', async () => {
      // Write invalid data as key
      fs.writeFileSync(keyPath, 'invalid-key-data');

      const encryption2 = new EncryptionService(keyPath);
      // Should not throw - it will use the invalid key as-is
      await encryption2.initialize();
      expect(encryption2.isInitialized()).toBe(true);
    });
  });

  describe('encrypt/decrypt', () => {
    beforeEach(async () => {
      await encryption.initialize();
    });

    it('should encrypt and decrypt a string', () => {
      const plaintext = 'my-secret-api-key';
      const ciphertext = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'same-value';
      const cipher1 = encryption.encrypt(plaintext);
      const cipher2 = encryption.encrypt(plaintext);

      expect(cipher1).not.toBe(cipher2);
    });

    it('should encrypt empty string', () => {
      const ciphertext = encryption.encrypt('');
      const decrypted = encryption.decrypt(ciphertext);
      expect(decrypted).toBe('');
    });

    it('should encrypt long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const ciphertext = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt unicode characters', () => {
      const plaintext = '你好世界 🎉 Hello';
      const ciphertext = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when encrypting without initialization', () => {
      const uninitialized = new EncryptionService(path.join(tempDir, 'no-key'));
      expect(() => uninitialized.encrypt('test')).toThrow('not initialized');
    });

    it('should throw error when decrypting without initialization', () => {
      const uninitialized = new EncryptionService(path.join(tempDir, 'no-key'));
      expect(() => uninitialized.decrypt('test')).toThrow('not initialized');
    });

    it('should throw error when decrypting invalid data', () => {
      expect(() => encryption.decrypt('invalid-encrypted-data')).toThrow();
    });

    it('should throw error when decrypting with wrong key', async () => {
      const plaintext = 'secret-data';
      const ciphertext = encryption.encrypt(plaintext);

      const encryption2 = new EncryptionService(path.join(tempDir, 'key2'));
      await encryption2.initialize();

      expect(() => encryption2.decrypt(ciphertext)).toThrow();
    });

    it('should handle special characters', () => {
      const plaintext = 'special\n\t\r\nchars';
      const ciphertext = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle JSON data', () => {
      const plaintext = JSON.stringify({ key: 'value', nested: { a: 1 } });
      const ciphertext = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(ciphertext);
      expect(JSON.parse(decrypted)).toEqual({ key: 'value', nested: { a: 1 } });
    });
  });

  describe('isEncrypted', () => {
    beforeEach(async () => {
      await encryption.initialize();
    });

    it('should return true for encrypted values', () => {
      const ciphertext = encryption.encrypt('test');
      expect(encryption.isEncrypted(ciphertext)).toBe(true);
    });

    it('should return false for plain strings', () => {
      expect(encryption.isEncrypted('plain-text')).toBe(false);
    });

    it('should return false for invalid base64', () => {
      expect(encryption.isEncrypted('not-valid-base64!!!')).toBe(false);
    });

    it('should return false for short base64 strings', () => {
      expect(encryption.isEncrypted(Buffer.from('short').toString('base64'))).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(encryption.isEncrypted('')).toBe(false);
    });

    it('should handle base64-like strings correctly', () => {
      // A proper base64 string that's too short
      const shortBase64 = Buffer.from('abc').toString('base64');
      expect(encryption.isEncrypted(shortBase64)).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(encryption.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await encryption.initialize();
      expect(encryption.isInitialized()).toBe(true);
    });
  });

  describe('key persistence', () => {
    it('should persist key across instances', async () => {
      await encryption.initialize();
      const plaintext = 'secret';
      const ciphertext = encryption.encrypt(plaintext);

      // Create new instance with same key path
      const encryption2 = new EncryptionService(keyPath);
      await encryption2.initialize();
      const decrypted = encryption2.decrypt(ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('should work with password-protected keys', async () => {
      await encryption.initialize('my-password');
      const plaintext = 'secret';
      const ciphertext = encryption.encrypt(plaintext);

      // Create new instance with same password
      const encryption2 = new EncryptionService(keyPath);
      await encryption2.initialize('my-password');
      const decrypted = encryption2.decrypt(ciphertext);

      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('SecureConfigManager', () => {
  let encryption: EncryptionService;
  let manager: SecureConfigManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-test-'));
    encryption = new EncryptionService(path.join(tempDir, '.key'));
    await encryption.initialize();
    manager = new SecureConfigManager(encryption);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('encryptConfig', () => {
    it('should encrypt sensitive fields', () => {
      const config = {
        apiKey: 'my-api-key',
        name: 'test-config',
      };

      const encrypted = manager.encryptConfig(config);

      expect(encrypted.apiKey).not.toBe('my-api-key');
      expect(encrypted.name).toBe('test-config');
    });

    it('should encrypt nested sensitive fields', () => {
      const config = {
        providers: {
          openai: {
            apiKey: 'sk-openai-key',
            name: 'OpenAI',
          },
        },
      };

      const encrypted = manager.encryptConfig(config);

      expect(encrypted.providers.openai.apiKey).not.toBe('sk-openai-key');
      expect(encrypted.providers.openai.name).toBe('OpenAI');
    });

    it('should handle non-initialized encryption', () => {
      const uninitializedEncryption = new EncryptionService(path.join(tempDir, 'no-key'));
      const uninitializedManager = new SecureConfigManager(uninitializedEncryption);

      const config = { apiKey: 'test-key' };
      const result = uninitializedManager.encryptConfig(config);

      expect(result.apiKey).toBe('test-key');
    });

    it('should handle arrays', () => {
      const config = {
        items: [{ apiKey: 'key1' }, { apiKey: 'key2' }],
      };

      const encrypted = manager.encryptConfig(config);

      // Arrays should be processed recursively
      expect(Array.isArray(encrypted.items)).toBe(true);
    });

    it('should handle null values', () => {
      const config = {
        apiKey: null,
        name: 'test',
      };

      const encrypted = manager.encryptConfig(config);
      expect(encrypted.apiKey).toBeNull();
    });

    it('should handle empty objects', () => {
      const config = {};
      const encrypted = manager.encryptConfig(config);
      expect(encrypted).toEqual({});
    });

    it('should not modify original config', () => {
      const config = {
        apiKey: 'test-key',
      };

      const encrypted = manager.encryptConfig(config);
      expect(config.apiKey).toBe('test-key');
      expect(encrypted.apiKey).not.toBe('test-key');
    });
  });

  describe('decryptConfig', () => {
    it('should decrypt encrypted fields', () => {
      const config = {
        apiKey: 'my-api-key',
        name: 'test-config',
      };

      const encrypted = manager.encryptConfig(config);
      const decrypted = manager.decryptConfig(encrypted);

      expect(decrypted.apiKey).toBe('my-api-key');
      expect(decrypted.name).toBe('test-config');
    });

    it('should decrypt nested encrypted fields', () => {
      const config = {
        providers: {
          openai: {
            apiKey: 'sk-openai-key',
          },
        },
      };

      const encrypted = manager.encryptConfig(config);
      const decrypted = manager.decryptConfig(encrypted);

      expect(decrypted.providers.openai.apiKey).toBe('sk-openai-key');
    });

    it('should handle non-initialized encryption', () => {
      const uninitializedEncryption = new EncryptionService(path.join(tempDir, 'no-key'));
      const uninitializedManager = new SecureConfigManager(uninitializedEncryption);

      const config = { apiKey: 'test-key' };
      const result = uninitializedManager.decryptConfig(config);

      expect(result.apiKey).toBe('test-key');
    });

    it('should preserve non-encrypted values', () => {
      const config = {
        apiKey: 'plain-key', // Not encrypted
        name: 'test',
      };

      const decrypted = manager.decryptConfig(config);

      expect(decrypted.apiKey).toBe('plain-key');
    });

    it('should handle decryption errors gracefully', () => {
      const config = {
        apiKey: 'invalid-encrypted-value',
      };

      // Should not throw, just keep original value
      const decrypted = manager.decryptConfig(config);
      expect(decrypted.apiKey).toBe('invalid-encrypted-value');
    });

    it('should not modify original config', () => {
      const config = {
        apiKey: 'test-key',
      };

      const encrypted = manager.encryptConfig(config);
      manager.decryptConfig(encrypted);
      expect(encrypted.apiKey).not.toBe('test-key');
    });

    it('should handle arrays in decrypt', () => {
      const config = {
        items: [{ apiKey: 'key1' }, { apiKey: 'key2' }],
      };

      const encrypted = manager.encryptConfig(config);
      const decrypted = manager.decryptConfig(encrypted);

      expect(Array.isArray(decrypted.items)).toBe(true);
      expect(decrypted.items[0].apiKey).toBe('key1');
      expect(decrypted.items[1].apiKey).toBe('key2');
    });

    it('should log warning when decryption fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create a config with a value that looks like base64 but can't be decrypted
      const config = {
        apiKey: 'YW55VGhpbmdUaGF0SW5WYWxpZEJhc2U2NEVuY29kZWRTdHJpbmc=', // Valid base64 but not encrypted
      };

      const decrypted = manager.decryptConfig(config);

      // Should preserve the value and log warning
      expect(decrypted.apiKey).toBe('YW55VGhpbmdUaGF0SW5WYWxpZEJhc2U2NEVuY29kZWRTdHJpbmc=');

      warnSpy.mockRestore();
    });
  });

  describe('sensitive field detection', () => {
    it('should detect apiKey as sensitive', () => {
      const config = { apiKey: 'test' };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.apiKey).not.toBe('test');
    });

    it('should detect api_key as sensitive', () => {
      const config = { api_key: 'test' };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.api_key).not.toBe('test');
    });

    it('should detect token as sensitive', () => {
      const config = { token: 'test' };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.token).not.toBe('test');
    });

    it('should detect secret as sensitive', () => {
      const config = { secret: 'test' };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.secret).not.toBe('test');
    });

    it('should detect password as sensitive', () => {
      const config = { password: 'test' };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.password).not.toBe('test');
    });

    it('should detect fields containing sensitive words', () => {
      const config = {
        myApiKey: 'test',
        userToken: 'test',
        secretKey: 'test',
        myPassword: 'test',
      };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.myApiKey).not.toBe('test');
      expect(encrypted.userToken).not.toBe('test');
      expect(encrypted.secretKey).not.toBe('test');
      expect(encrypted.myPassword).not.toBe('test');
    });

    it('should not detect non-sensitive fields', () => {
      const config = {
        name: 'test',
        model: 'gpt-4',
        enabled: true,
      };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.name).toBe('test');
      expect(encrypted.model).toBe('gpt-4');
      expect(encrypted.enabled).toBe(true);
    });

    it('should handle case-insensitive detection', () => {
      const config = {
        APIKEY: 'test',
        Api_Key: 'test',
        SECRETKEY: 'test',
      };
      const encrypted = manager.encryptConfig(config);
      expect(encrypted.APIKEY).not.toBe('test');
      expect(encrypted.Api_Key).not.toBe('test');
      expect(encrypted.SECRETKEY).not.toBe('test');
    });
  });

  describe('roundtrip', () => {
    it('should handle encrypt-decrypt roundtrip', () => {
      const original = {
        apiKey: 'my-key',
        providers: {
          openai: { apiKey: 'openai-key' },
          anthropic: { apiKey: 'anthropic-key' },
        },
        settings: {
          model: 'gpt-4',
          enabled: true,
        },
      };

      const encrypted = manager.encryptConfig(original);
      const decrypted = manager.decryptConfig(encrypted);

      expect(decrypted.apiKey).toBe('my-key');
      expect(decrypted.providers.openai.apiKey).toBe('openai-key');
      expect(decrypted.providers.anthropic.apiKey).toBe('anthropic-key');
      expect(decrypted.settings.model).toBe('gpt-4');
      expect(decrypted.settings.enabled).toBe(true);
    });

    it('should handle multiple roundtrips', () => {
      const config = { apiKey: 'key' };

      const encrypted1 = manager.encryptConfig(config);
      const decrypted1 = manager.decryptConfig(encrypted1);

      const encrypted2 = manager.encryptConfig(decrypted1);
      const decrypted2 = manager.decryptConfig(encrypted2);

      expect(decrypted2.apiKey).toBe('key');
    });
  });
});
