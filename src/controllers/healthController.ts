import { Elysia } from 'elysia';

/**
 * Health check controller
 */
export const healthController = (app: Elysia) =>
  app.get('/health', ({ logResponse }: { logResponse: (status: number) => void }) => {
    logResponse(200);
    return {
      status: 'ok',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    };
  });
