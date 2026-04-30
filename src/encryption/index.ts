import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigError, ErrorCode } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const ITERATIONS = 100000;

// Magic header for reliable encrypted value detection: "DRA" + version byte
const ENCRYPTED_PREFIX = Buffer.from([0x44, 0x52, 0x41]);
const ENCRYPT_FORMAT_VERSION = 1;
const PREFIX_LENGTH = ENCRYPTED_PREFIX.length + 1; // 3 magic + 1 version

const logger = getLogger();

/**
 * Encryption service for securing sensitive data like API keys
 */
export class EncryptionService {
  private masterKey: Buffer | null = null;
  private keyPath: string;

  constructor(keyPath?: string) {
    this.keyPath = keyPath || path.join(process.env.HOME || '.', '.dragon', '.key');
  }

  /**
   * Initialize the encryption service
   */
  async initialize(password?: string): Promise<void> {
    // Check if key file exists
    if (fs.existsSync(this.keyPath)) {
      const encryptedKey = fs.readFileSync(this.keyPath);
      if (password) {
        this.masterKey = await this.decryptKey(encryptedKey, password);
      } else {
        if (encryptedKey.length > KEY_LENGTH) {
          throw new ConfigError('Master key file appears encrypted. Please provide --password.', ErrorCode.CONFIG_INVALID);
        }
        this.masterKey = encryptedKey;
      }
    } else {
      // Generate new master key
      this.masterKey = crypto.randomBytes(KEY_LENGTH);
      
      if (password) {
        const encryptedKey = await this.encryptKey(this.masterKey, password);
        await this.ensureDirectoryExists();
        fs.writeFileSync(this.keyPath, encryptedKey);
        fs.chmodSync(this.keyPath, 0o600); // Only owner can read/write
      } else {
        // Save plain key (not recommended - password protection is strongly advised)
        await this.ensureDirectoryExists();
        fs.writeFileSync(this.keyPath, this.masterKey);
        fs.chmodSync(this.keyPath, 0o600);
        logger.warn('Master key stored without password encryption. Use --encrypt for stronger protection.');
      }
    }
  }

  /**
   * Encrypt a string value
   */
  encrypt(plaintext: string): string {
    if (!this.masterKey) {
      throw new ConfigError('Encryption service not initialized', ErrorCode.CONFIG_INVALID);
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    const plaintextBuf = Buffer.from(plaintext, 'utf8');
    const encrypted = Buffer.concat([
      cipher.update(plaintextBuf),
      cipher.final(),
    ]);
    plaintextBuf.fill(0); // Wipe plaintext from memory

    const authTag = cipher.getAuthTag();

    const versionByte = Buffer.from([ENCRYPT_FORMAT_VERSION]);

    // Format: magic(3) | version(1) | IV(16) | authTag(16) | ciphertext
    const result = Buffer.concat([ENCRYPTED_PREFIX, versionByte, iv, authTag, encrypted]);

    return result.toString('base64');
  }

  /**
   * Decrypt a string value
   */
  decrypt(ciphertext: string): string {
    if (!this.masterKey) {
      throw new ConfigError('Encryption service not initialized', ErrorCode.CONFIG_INVALID);
    }

    const data = Buffer.from(ciphertext, 'base64');

    // Verify magic header
    if (!this.hasValidPrefix(data)) {
      throw new ConfigError(
        'Invalid encrypted data: missing or corrupted header',
        ErrorCode.CONFIG_INVALID
      );
    }

    const version = data[ENCRYPTED_PREFIX.length];
    if (version !== ENCRYPT_FORMAT_VERSION) {
      throw new ConfigError(
        `Unsupported encryption format version: ${version}`,
        ErrorCode.CONFIG_INVALID
      );
    }

    const payloadStart = PREFIX_LENGTH;
    const iv = data.subarray(payloadStart, payloadStart + IV_LENGTH);
    const authTag = data.subarray(payloadStart + IV_LENGTH, payloadStart + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(payloadStart + IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const result = decrypted.toString('utf8');
    decrypted.fill(0); // Wipe decrypted data from memory after use
    return result;
  }

  /**
   * Check if a value is encrypted
   */
  isEncrypted(value: string): boolean {
    try {
      const data = Buffer.from(value, 'base64');
      return this.hasValidPrefix(data);
    } catch {
      return false;
    }
  }

  /**
   * Verify the magic header bytes are present
   */
  private hasValidPrefix(data: Buffer): boolean {
    if (data.length < PREFIX_LENGTH) return false;
    return ENCRYPTED_PREFIX.equals(data.subarray(0, ENCRYPTED_PREFIX.length));
  }

  /**
   * Timing-safe comparison of two buffers
   */
  static timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      // Still do a constant-time comparison to avoid length-based timing leaks
      crypto.timingSafeEqual(
        Buffer.alloc(Math.max(a.length, b.length)),
        Buffer.alloc(Math.max(a.length, b.length))
      );
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Encrypt the master key with a password
   */
  private async encryptKey(key: Buffer, password: string): Promise<Buffer> {
    const salt = crypto.randomBytes(SALT_LENGTH);

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha512', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(key),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    derivedKey.fill(0); // Wipe derived key from memory

    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  /**
   * Decrypt the master key with a password
   */
  private async decryptKey(encryptedKey: Buffer, password: string): Promise<Buffer> {
    const salt = encryptedKey.subarray(0, SALT_LENGTH);
    const iv = encryptedKey.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedKey.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedKey.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha512', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    const result = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    derivedKey.fill(0); // Wipe derived key from memory
    return result;
  }

  /**
   * Ensure the directory for the key file exists
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Check if encryption is initialized
   */
  isInitialized(): boolean {
    return this.masterKey !== null;
  }
}

/**
 * Secure config wrapper that encrypts sensitive fields
 */
export class SecureConfigManager {
  private encryption: EncryptionService;
  private sensitiveFields = ['apiKey', 'api_key', 'token', 'secret', 'password'];

  constructor(encryption?: EncryptionService) {
    this.encryption = encryption || new EncryptionService();
  }

  /**
   * Encrypt sensitive fields in config
   */
  encryptConfig(config: Record<string, any>): Record<string, any> {
    if (!this.encryption.isInitialized()) {
      return config;
    }

    // Handle arrays
    if (Array.isArray(config)) {
      return config.map(item => this.encryptConfig(item));
    }

    const encrypted = { ...config };

    for (const key of Object.keys(encrypted)) {
      if (this.isSensitiveField(key) && typeof encrypted[key] === 'string') {
        encrypted[key] = this.encryption.encrypt(encrypted[key]);
      } else if (typeof encrypted[key] === 'object' && encrypted[key] !== null) {
        encrypted[key] = this.encryptConfig(encrypted[key]);
      }
    }

    return encrypted;
  }

  /**
   * Decrypt sensitive fields in config
   */
  decryptConfig(config: Record<string, any>): Record<string, any> {
    if (!this.encryption.isInitialized()) {
      return config;
    }

    // Handle arrays
    if (Array.isArray(config)) {
      return config.map(item => this.decryptConfig(item));
    }

    const decrypted = { ...config };

    for (const key of Object.keys(decrypted)) {
      if (this.isSensitiveField(key) && typeof decrypted[key] === 'string') {
        try {
          // Only decrypt if it's actually encrypted
          if (this.encryption.isEncrypted(decrypted[key])) {
            decrypted[key] = this.encryption.decrypt(decrypted[key]);
          }
        } catch (error) {
          // If decryption fails, keep original value
          logger.warn(`Failed to decrypt sensitive field`);
        }
      } else if (typeof decrypted[key] === 'object' && decrypted[key] !== null) {
        decrypted[key] = this.decryptConfig(decrypted[key]);
      }
    }

    return decrypted;
  }

  /**
   * Check if a field name is sensitive
   */
  private isSensitiveField(fieldName: string): boolean {
    const lower = fieldName.toLowerCase();
    return this.sensitiveFields.some(sensitive =>
      lower.includes(sensitive.toLowerCase())
    );
  }
}

// Global encryption service instance
export const encryptionService = new EncryptionService();
export const secureConfigManager = new SecureConfigManager(encryptionService);
