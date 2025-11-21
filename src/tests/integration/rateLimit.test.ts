import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import { rateLimitPlugin } from '../../middleware/rateLimit';
import { Elysia } from 'elysia';

describe('Rate Limit Integration Tests', () => {
  describe('Rate limit middleware with Elysia app', () => {
    it('should allow requests under the limit', async () => {
      const { plugin } = rateLimitPlugin({
        windowMs: 60000, // 1 minute
        maxRequests: 5
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      // Make 5 requests (all should succeed)
      for (let i = 0; i < 5; i++) {
        const response = await app.handle(new Request('http://localhost/test'));
        expect(response.status).toBe(200);

        const limitHeader = response.headers.get('X-RateLimit-Limit');
        const remainingHeader = response.headers.get('X-RateLimit-Remaining');

        expect(limitHeader).toBe('5');
        expect(remainingHeader).toBe(String(4 - i));
      }
    });

    it('should block requests over the limit', async () => {
      const { plugin } = rateLimitPlugin({
        windowMs: 60000,
        maxRequests: 3
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      // Make 3 requests (should succeed)
      for (let i = 0; i < 3; i++) {
        const response = await app.handle(new Request('http://localhost/test'));
        expect(response.status).toBe(200);
      }

      // 4th request should be rate limited
      const response = await app.handle(new Request('http://localhost/test'));
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toBe('TooManyRequests');
      expect(body.retryAfter).toBeDefined();

      // Check rate limit headers
      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should include proper rate limit headers', async () => {
      const { plugin } = rateLimitPlugin({
        windowMs: 60000,
        maxRequests: 10
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      const response = await app.handle(new Request('http://localhost/test'));

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should reset after window expires', async () => {
      const { plugin } = rateLimitPlugin({
        windowMs: 100, // 100ms window for testing
        maxRequests: 2
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      // Make 2 requests
      await app.handle(new Request('http://localhost/test'));
      await app.handle(new Request('http://localhost/test'));

      // 3rd should be blocked
      let response = await app.handle(new Request('http://localhost/test'));
      expect(response.status).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should work again
      response = await app.handle(new Request('http://localhost/test'));
      expect(response.status).toBe(200);
    });

    it('should track different IPs separately', async () => {
      const { plugin } = rateLimitPlugin({
        windowMs: 60000,
        maxRequests: 2
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      // IP 1 makes 2 requests
      const req1 = new Request('http://localhost/test', {
        headers: { 'X-Forwarded-For': '192.168.1.1' }
      });

      await app.handle(req1);
      await app.handle(req1);

      // IP 1 should be rate limited
      let response = await app.handle(req1);
      expect(response.status).toBe(429);

      // IP 2 should still work
      const req2 = new Request('http://localhost/test', {
        headers: { 'X-Forwarded-For': '192.168.1.2' }
      });

      response = await app.handle(req2);
      expect(response.status).toBe(200);
    });

    it('should use custom message when provided', async () => {
      const customMessage = 'Rate limit exceeded - please slow down';
      const { plugin } = rateLimitPlugin({
        windowMs: 60000,
        maxRequests: 1,
        message: customMessage
      });

      const app = new Elysia()
        .use(plugin)
        .get('/test', () => ({ success: true }));

      // First request succeeds
      await app.handle(new Request('http://localhost/test'));

      // Second request should be rate limited with custom message
      const response = await app.handle(new Request('http://localhost/test'));
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.message).toBe(customMessage);
    });

    it('should work with actual app endpoints', async () => {
      const { app, rateLimiter } = createApp();

      // Health check should have rate limiting if enabled
      const response = await app.handle(new Request('http://localhost/health'));
      expect(response.status).toBe(200);

      // Should have rate limit headers (if rate limiting is enabled)
      const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
      if (rateLimitEnabled) {
        expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
        expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      }

      // Cleanup
      if (rateLimiter) {
        rateLimiter.stop();
      }
    });
  });
});
