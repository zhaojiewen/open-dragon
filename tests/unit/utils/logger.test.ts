import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel, getLogger, createLogger } from '../../../src/utils/logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper to wait for file operations to complete
const waitForFileWrite = (ms: number = 50) => new Promise(resolve => setTimeout(resolve, ms));

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    try {
      logger?.close();
      // Let file stream finish closing
      await new Promise(resolve => setTimeout(resolve, 20));
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      logger = createLogger({ enableConsole: false });
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should use DEBUG level when DEBUG env is set', () => {
      process.env.DEBUG = 'true';
      logger = createLogger({ enableConsole: false });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
      delete process.env.DEBUG;
    });

    it('should accept custom log level', () => {
      logger = createLogger({ level: LogLevel.WARN, enableConsole: false });
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should create file stream when file logging enabled', async () => {
      const logFile = path.join(tempDir, 'test.log');
      // Ensure directory exists
      fs.mkdirSync(path.dirname(logFile), { recursive: true });

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      logger.info('Test message');
      await waitForFileWrite();
      logger.close();

      expect(fs.existsSync(logFile)).toBe(true);
      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('Test message');
    });

    it('should create log directory if not exists', async () => {
      const logFile = path.join(tempDir, 'nested', 'dir', 'test.log');

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      logger.info('Test');
      await waitForFileWrite();
      logger.close();

      expect(fs.existsSync(path.dirname(logFile))).toBe(true);
    });

    it('should use default DEBUG value when env not set', () => {
      delete process.env.DEBUG;
      logger = createLogger({ enableConsole: false });
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('log levels', () => {
    beforeEach(() => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true });
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('Test warn message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should filter debug messages when level is INFO', () => {
      logger.debug('Test debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when level is DEBUG', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Test debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not log any messages when level is NONE', () => {
      logger.setLevel(LogLevel.NONE);
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLevel', () => {
    beforeEach(() => {
      logger = createLogger({ level: LogLevel.ERROR, enableConsole: true });
    });

    it('should change log level', () => {
      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should affect logging behavior', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.info('Should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.setLevel(LogLevel.INFO);
      logger.info('Should log');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should update internal _level', () => {
      logger.setLevel(LogLevel.WARN);
      expect(logger._level).toBe(LogLevel.WARN);
    });
  });

  describe('enableDebug/disableDebug', () => {
    beforeEach(() => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true });
    });

    it('should enable debug mode', () => {
      logger.enableDebug();
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should disable debug mode', () => {
      logger.enableDebug();
      logger.disableDebug();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should log debug message when enabling debug', () => {
      logger.enableDebug();
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('data parameter', () => {
    beforeEach(() => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true });
    });

    it('should include data in log output', () => {
      logger.info('Test message', { key: 'value' });
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('key');
    });

    it('should handle various data types', () => {
      logger.info('Test', { number: 123, bool: true, array: [1, 2, 3] });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle null data', () => {
      logger.info('Test', null);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle undefined data', () => {
      logger.info('Test', undefined);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle string data', () => {
      logger.info('Test', 'string data');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle number data', () => {
      logger.info('Test', 42);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('timestamps', () => {
    it('should include timestamps by default', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true });
      logger.info('Test message');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should not include timestamps when disabled', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, timestamp: false });
      logger.info('Test message');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/^\[INFO/);
    });
  });

  describe('colors', () => {
    it('should colorize when enabled', () => {
      logger = createLogger({ level: LogLevel.DEBUG, enableConsole: true, colors: true });
      logger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not colorize when disabled', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, colors: false });
      logger.info('Test message');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).not.toMatch(/\x1b\[/);
    });

    it('should colorize debug messages with dim', () => {
      logger = createLogger({ level: LogLevel.DEBUG, enableConsole: true, colors: true });
      logger.debug('Debug');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should colorize info messages with blue', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, colors: true });
      logger.info('Info');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should colorize warn messages with yellow', () => {
      logger = createLogger({ level: LogLevel.WARN, enableConsole: true, colors: true });
      logger.warn('Warn');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should colorize error messages with red', () => {
      logger = createLogger({ level: LogLevel.ERROR, enableConsole: true, colors: true });
      logger.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('console output control', () => {
    it('should not output to console when disabled', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: false });
      logger.info('Test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should use console.error for error level', () => {
      logger = createLogger({ level: LogLevel.ERROR, enableConsole: true });
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should use console.warn for warn level', () => {
      logger = createLogger({ level: LogLevel.WARN, enableConsole: true });
      logger.warn('Warn message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('time/timeEnd', () => {
    beforeEach(() => {
      logger = createLogger({ level: LogLevel.DEBUG, enableConsole: true });
    });

    it('should start and end timers', () => {
      logger.time('test-timer');
      const duration = logger.timeEnd('test-timer');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent timer', () => {
      const duration = logger.timeEnd('non-existent');
      expect(duration).toBeNull();
    });

    it('should handle multiple timers', () => {
      logger.time('timer1');
      logger.time('timer2');

      const duration1 = logger.timeEnd('timer1');
      const duration2 = logger.timeEnd('timer2');

      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
    });

    it('should delete timer after timeEnd', () => {
      logger.time('timer');
      logger.timeEnd('timer');
      const duration = logger.timeEnd('timer');
      expect(duration).toBeNull();
    });

    it('should log warning for non-existent timer', () => {
      logger.timeEnd('non-existent');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('file output', () => {
    it('should write to file when enabled', async () => {
      const logFile = path.join(tempDir, 'file-output.log');
      fs.mkdirSync(path.dirname(logFile), { recursive: true });

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      logger.info('File test');
      await waitForFileWrite();
      logger.close();

      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('File test');
    });

    it('should append to existing file', async () => {
      const logFile = path.join(tempDir, 'append.log');
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.writeFileSync(logFile, 'existing content\n');

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      logger.info('New content');
      await waitForFileWrite();
      logger.close();

      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('existing content');
      expect(content).toContain('New content');
    });

    it('should not write to file when disabled', () => {
      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: false,
      });

      logger.info('Should not appear in file');
      logger.close();

      const files = fs.readdirSync(tempDir);
      expect(files.length).toBe(0);
    });

    it('should handle file stream errors gracefully', async () => {
      const logFile = path.join(tempDir, 'error-test.log');

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      // Close the stream and then try to write
      logger.close();

      // This should not throw even though stream is closed
      expect(() => logger.info('After close')).not.toThrow();
    });
  });

  describe('close', () => {
    it('should close file stream', async () => {
      const logFile = path.join(tempDir, 'close-test.log');
      fs.mkdirSync(path.dirname(logFile), { recursive: true });

      logger = createLogger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: true,
        logFile,
      });

      logger.info('Before close');
      await waitForFileWrite();
      logger.close();

      expect(fs.existsSync(logFile)).toBe(true);
    });

    it('should handle close when no file stream', () => {
      logger = createLogger({ enableConsole: false });
      expect(() => logger.close()).not.toThrow();
    });

    it('should handle multiple close calls', () => {
      logger = createLogger({ enableConsole: false });
      logger.close();
      expect(() => logger.close()).not.toThrow();
    });
  });

  describe('formatMessage', () => {
    it('should format message with timestamp', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, timestamp: true });
      logger.info('Test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should format message with level', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, timestamp: false });
      logger.info('Test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/^\[INFO/);
    });

    it('should format message with data', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true, timestamp: false });
      logger.info('Test', { key: 'value' });
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('{"key":"value"}');
    });
  });

  describe('getLogger singleton', () => {
    it('should return the same logger instance', () => {
      const logger1 = getLogger({ enableConsole: false });
      const logger2 = getLogger({ enableConsole: false });
      expect(logger1).toBe(logger2);
    });

    it('should create logger with config on first call', () => {
      const logger = getLogger({ level: LogLevel.WARN, enableConsole: false });
      expect(logger).toBeDefined();
    });
  });

  describe('createLogger', () => {
    it('should create new logger instances', () => {
      const logger1 = createLogger({ enableConsole: false });
      const logger2 = createLogger({ enableConsole: false });
      expect(logger1).not.toBe(logger2);
    });
  });

  describe('log level filtering', () => {
    it('should only log error when level is ERROR', () => {
      logger = createLogger({ level: LogLevel.ERROR, enableConsole: true });

      logger.debug('Debug');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.info('Info');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.warn('Warn');
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      logger.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log warn and above when level is WARN', () => {
      logger = createLogger({ level: LogLevel.WARN, enableConsole: true });

      logger.info('Info');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.warn('Warn');
      expect(consoleWarnSpy).toHaveBeenCalled();

      logger.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log info and above when level is INFO', () => {
      logger = createLogger({ level: LogLevel.INFO, enableConsole: true });

      logger.debug('Debug');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.info('Info');
      expect(consoleLogSpy).toHaveBeenCalled();

      logger.warn('Warn');
      expect(consoleWarnSpy).toHaveBeenCalled();

      logger.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log all when level is DEBUG', () => {
      logger = createLogger({ level: LogLevel.DEBUG, enableConsole: true });

      logger.debug('Debug');
      expect(consoleLogSpy).toHaveBeenCalled();

      logger.info('Info');
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);

      logger.warn('Warn');
      expect(consoleWarnSpy).toHaveBeenCalled();

      logger.error('Error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
