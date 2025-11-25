import { Elysia } from 'elysia';

/**
 * Health check controller
 */
export const healthController = (app: Elysia) =>
  app.get('/health', () => {
    return {
      status: 'ok',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    };
  });
