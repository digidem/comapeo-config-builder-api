import { Elysia } from 'elysia';

/**
 * Logger middleware
 */
export const logger = (app: Elysia) =>
  app.derive(({ request }) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    const requestPath = new URL(request.url).pathname;
    
    console.log(`[${requestId}] ${request.method} ${requestPath} - Started`);
    
    return {
      requestId,
      logResponse: (status: number) => {
        const duration = Date.now() - start;
        console.log(`[${requestId}] ${request.method} ${requestPath} - ${status} (${duration}ms)`);
      }
    };
  });
