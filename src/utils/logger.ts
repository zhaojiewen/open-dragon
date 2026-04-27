/**
 * Logging system for Dragon CLI
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 9999,
}

export interface LoggerConfig {
  level: LogLevel;
  enableFile: boolean;
  logFile?: string;
  enableConsole: boolean;
  timestamp: boolean;
  colors: boolean;
  securityLogFile?: string;
}

class Logger {
  private config: LoggerConfig;
  private logFileStream: fs.WriteStream | null = null;
  private securityLogStream: fs.WriteStream | null = null;
  private timers: Map<string, number> = new Map();
  public _level: LogLevel; // Public for testing/debugging

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? (process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO),
      enableFile: config.enableFile ?? false,
      logFile: config.logFile,
      enableConsole: config.enableConsole ?? true,
      timestamp: config.timestamp ?? true,
      colors: config.colors ?? true,
      securityLogFile: config.securityLogFile,
    };
    this._level = this.config.level;

    if (this.config.enableFile && this.config.logFile) {
      this.initFileStream();
    }

    if (this.config.securityLogFile) {
      this.initSecurityLogStream();
    }
  }

  private initFileStream(): void {
    if (!this.config.logFile) return;

    const logDir = path.dirname(this.config.logFile);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
      } catch {
        // Directory may have been created by another process
      }
    }

    try {
      this.logFileStream = fs.createWriteStream(this.config.logFile, {
        flags: 'a',
        encoding: 'utf-8',
      });
    } catch {
      this.logFileStream = null;
    }
  }

  private initSecurityLogStream(): void {
    if (!this.config.securityLogFile) return;

    const logDir = path.dirname(this.config.securityLogFile);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
      } catch {
        // Directory may have been created by another process
      }
    }

    try {
      this.securityLogStream = fs.createWriteStream(this.config.securityLogFile, {
        flags: 'a',
        encoding: 'utf-8',
      });
    } catch {
      // If we can't create the file stream, just disable security logging
      this.securityLogStream = null;
    }
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = this.config.timestamp ? `[${new Date().toISOString()}] ` : '';
    const levelStr = `[${level.padEnd(5)}] `;
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `${timestamp}${levelStr}${message}${dataStr}`;
  }

  private colorize(level: string, message: string): string {
    if (!this.config.colors) return message;

    switch (level) {
      case 'DEBUG':
        return chalk.dim(message);
      case 'INFO':
        return chalk.blue(message);
      case 'WARN':
        return chalk.yellow(message);
      case 'ERROR':
        return chalk.red(message);
      default:
        return message;
    }
  }

  private log(level: LogLevel, levelName: string, message: string, data?: unknown): void {
    if (level < this.config.level) return;

    const formattedMessage = this.formatMessage(levelName, message, data);

    // Console output
    if (this.config.enableConsole) {
      const coloredMessage = this.colorize(levelName, formattedMessage);
      if (level >= LogLevel.ERROR) {
        console.error(coloredMessage);
      } else if (level >= LogLevel.WARN) {
        console.warn(coloredMessage);
      } else {
        console.log(coloredMessage);
      }
    }

    // File output
    if (this.config.enableFile && this.logFileStream) {
      this.logFileStream.write(formattedMessage + '\n');
    }
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }

  security(event: string, details?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      details,
    };

    // Write to security log file
    if (this.securityLogStream) {
      this.securityLogStream.write(JSON.stringify(logEntry) + '\n');
    }

    // Also log to regular log
    this.info(`SECURITY: ${event}`, details);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
    this._level = level;
  }

  getLevel(): LogLevel {
    return this._level;
  }

  setLogFile(filePath: string): void {
    this.config.logFile = filePath;
    this.config.enableFile = true;
    this.initFileStream();
  }

  setSecurityLogFile(filePath: string): void {
    this.config.securityLogFile = filePath;
    this.initSecurityLogStream();
  }

  enableDebug(): void {
    this.setLevel(LogLevel.DEBUG);
    this.debug('Debug mode enabled');
  }

  disableDebug(): void {
    this.setLevel(LogLevel.INFO);
  }

  // Performance timing methods
  time(label: string): void {
    this.timers.set(label, performance.now());
    this.debug(`Timer started: ${label}`);
  }

  timeEnd(label: string): number | null {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      this.warn(`Timer not found: ${label}`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);
    this.debug(`Timer ended: ${label}`, { duration: `${duration.toFixed(2)}ms` });
    return duration;
  }

  close(): void {
    if (this.logFileStream) {
      this.logFileStream.end();
      this.logFileStream = null;
    }
    if (this.securityLogStream) {
      this.securityLogStream.end();
      this.securityLogStream = null;
    }
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

export { Logger };
