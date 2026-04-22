import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigError, ErrorCode } from '../utils/errors.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const ITERATIONS = 100000;

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
        // Try to read plain key (development mode)
        try {
          this.masterKey = encryptedKey;
        } catch {
          throw new ConfigError('Master key file exists but cannot be read. Please provide password.', ErrorCode.CONFIG_INVALID);
        }
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
        // Save plain key (development mode - not recommended for production)
        await this.ensureDirectoryExists();
        fs.writeFileSync(this.keyPath, this.masterKey);
        fs.chmodSync(this.keyPath, 0o600);
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

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and encrypted data
    const result = Buffer.concat([iv, authTag, encrypted]);

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

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Check if a value is encrypted
   */
  isEncrypted(value: string): boolean {
    try {
      const data = Buffer.from(value, 'base64');
      // Check if it has the expected structure (IV + auth tag + some data)
      return data.length > IV_LENGTH + AUTH_TAG_LENGTH;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt the master key with a password
   */
  private async encryptKey(key: Buffer, password: string): Promise<Buffer> {
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive key from password
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

    // Combine salt, IV, auth tag, and encrypted key
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

    // Derive key from password
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha512', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
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
          console.warn(`Failed to decrypt field ${key}`);
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
    const lowerName = fieldName.toLowerCase();
    return this.sensitiveFields.some(sensitive => 
      lowerName.includes(sensitive.toLowerCase())
    );
  }
}

// Global encryption service instance
export const encryptionService = new EncryptionService();
export const secureConfigManager = new SecureConfigManager(encryptionService);
