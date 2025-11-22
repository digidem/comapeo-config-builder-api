/**
 * Structured logging utility
 * Provides consistent log formatting and levels without external dependencies
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;
  private serviceName: string;

  constructor(serviceName: string = 'comapeo-config-builder-api', minLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatLog(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...(context && { context })
    };
    return JSON.stringify(logEntry);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatLog('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatLog('INFO', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatLog('WARN', message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatLog('ERROR', message, context));
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger(this.serviceName, this.minLevel);
    // Wrap methods to include context
    const originalInfo = childLogger.info.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);
    const originalDebug = childLogger.debug.bind(childLogger);

    childLogger.info = (message: string, additionalContext?: LogContext) => {
      originalInfo(message, { ...context, ...additionalContext });
    };

    childLogger.warn = (message: string, additionalContext?: LogContext) => {
      originalWarn(message, { ...context, ...additionalContext });
    };

    childLogger.error = (message: string, additionalContext?: LogContext) => {
      originalError(message, { ...context, ...additionalContext });
    };

    childLogger.debug = (message: string, additionalContext?: LogContext) => {
      originalDebug(message, { ...context, ...additionalContext });
    };

    return childLogger;
  }
}

// Default logger instance
export const logger = new Logger('comapeo-config-builder-api',
  process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO
);

// Export Logger class for testing
export { Logger };
