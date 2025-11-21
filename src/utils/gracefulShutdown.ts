/**
 * Graceful shutdown utilities
 * Handles cleanup of resources and in-flight requests on server shutdown
 */

import { logger } from './logger';

interface ShutdownConfig {
  timeout: number; // Maximum time to wait for shutdown in milliseconds
}

type ShutdownHandler = () => Promise<void>;

class GracefulShutdown {
  private handlers: Set<ShutdownHandler> = new Set();
  private shuttingDown: boolean = false;
  private shutdownPromise: Promise<void> | null = null;

  /**
   * Register a shutdown handler
   * Handlers are called in the order they were registered
   */
  registerHandler(handler: ShutdownHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Unregister a shutdown handler
   */
  unregisterHandler(handler: ShutdownHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Perform graceful shutdown
   * Calls all registered handlers with a timeout
   */
  async shutdown(config: ShutdownConfig): Promise<void> {
    if (this.shuttingDown) {
      // Already shutting down, return existing promise
      return this.shutdownPromise!;
    }

    this.shuttingDown = true;
    logger.info('Graceful shutdown initiated', {
      handlerCount: this.handlers.size,
      timeoutMs: config.timeout
    });

    this.shutdownPromise = this.executeShutdown(config);
    return this.shutdownPromise;
  }

  private async executeShutdown(config: ShutdownConfig): Promise<void> {
    const handlers = Array.from(this.handlers);
    const startTime = Date.now();
    let timeoutId: Timer | null = null;

    // Create timeout promise
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.warn('Shutdown timeout reached', {
          timeoutMs: config.timeout,
          handlersCompleted: 0  // We don't track this precisely
        });
        resolve();
      }, config.timeout);
    });

    // Execute all shutdown handlers
    const shutdownPromise = (async () => {
      for (let i = 0; i < handlers.length; i++) {
        const handler = handlers[i];
        try {
          logger.debug('Executing shutdown handler', { index: i + 1, total: handlers.length });
          await handler();
        } catch (error) {
          logger.error('Shutdown handler failed', {
            index: i + 1,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue with other handlers even if one fails
        }
      }
    })();

    // Race between timeout and actual shutdown
    await Promise.race([shutdownPromise, timeoutPromise]);

    // Clear timeout if shutdown completed before timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    const elapsed = Date.now() - startTime;
    logger.info('Graceful shutdown completed', {
      elapsedMs: elapsed,
      timedOut: elapsed >= config.timeout
    });
  }
}

// Global singleton instance
export const gracefulShutdown = new GracefulShutdown();

// Default shutdown configuration
// 30 seconds to complete shutdown
export const defaultShutdownConfig: ShutdownConfig = {
  timeout: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10)
};

/**
 * Setup shutdown signal handlers
 * Listens for SIGTERM and SIGINT
 */
export function setupShutdownHandlers(
  server: any,
  config: ShutdownConfig = defaultShutdownConfig
): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown`);

    // Perform graceful shutdown
    await gracefulShutdown.shutdown(config);

    // Stop the server
    if (server && typeof server.stop === 'function') {
      try {
        await server.stop();
        logger.info('Server stopped successfully');
      } catch (error) {
        logger.error('Error stopping server', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Exit process
    process.exit(0);
  };

  // Handle SIGTERM (Docker, systemd, etc.)
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Shutdown handlers registered', {
    signals: ['SIGTERM', 'SIGINT'],
    timeoutMs: config.timeout
  });
}
