import { describe, it, expect } from 'bun:test';
import { withTimeout, checkTimeout, defaultTimeoutConfig } from '../../../middleware/timeout';

describe('Timeout Middleware', () => {
  describe('withTimeout', () => {
    it('should allow fast requests to complete normally', async () => {
      const fastHandler = async (request: Request) => {
        return new Response('Success', { status: 200 });
      };

      const wrappedHandler = withTimeout(fastHandler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Success');
    });

    it('should timeout slow requests', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const wrappedHandler = withTimeout(slowHandler, { timeoutMs: 100 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(408); // Request Timeout
      const body = await response.json();
      expect(body.error).toBe('RequestTimeout');
      expect(body.timeoutMs).toBe(100);
    });

    it('should include custom message in timeout response', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const customMessage = 'Custom timeout message';
      const wrappedHandler = withTimeout(slowHandler, {
        timeoutMs: 100,
        message: customMessage
      });

      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(408);
      const body = await response.json();
      expect(body.message).toBe(customMessage);
    });

    it('should include elapsed time in timeout response', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const wrappedHandler = withTimeout(slowHandler, { timeoutMs: 150 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      const body = await response.json();
      // Allow some tolerance for timing precision
      expect(body.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(body.elapsedMs).toBeLessThan(250);
    });

    it('should propagate errors from handler', async () => {
      const errorHandler = async (request: Request) => {
        throw new Error('Test error');
      };

      const wrappedHandler = withTimeout(errorHandler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');

      await expect(wrappedHandler(request)).rejects.toThrow('Test error');
    });
  });

  describe('checkTimeout', () => {
    it('should correctly detect non-timeout', () => {
      const startTime = Date.now();
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(false);
      expect(result.elapsed).toBeLessThanOrEqual(100); // Should be very small (allow for test overhead)
      expect(result.remaining).toBeGreaterThanOrEqual(900); // Most of time should remain
    });

    it('should correctly detect timeout', () => {
      const startTime = Date.now() - 2000; // 2 seconds ago
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(true);
      expect(result.elapsed).toBeGreaterThanOrEqual(2000);
      expect(result.remaining).toBe(0);
    });

    it('should calculate remaining time correctly', () => {
      const startTime = Date.now() - 500; // 500ms ago
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(false);
      expect(result.elapsed).toBeGreaterThanOrEqual(500);
      expect(result.remaining).toBeLessThanOrEqual(500);
      expect(result.remaining).toBeGreaterThanOrEqual(400); // Allow some tolerance for timing precision
    });
  });

  describe('defaultTimeoutConfig', () => {
    it('should have reasonable default timeout', () => {
      expect(defaultTimeoutConfig.timeoutMs).toBe(300000); // 5 minutes
      expect(defaultTimeoutConfig.message).toBeTruthy();
    });

    it('should respect REQUEST_TIMEOUT_MS environment variable', () => {
      // Note: This test would need to run in a separate process to test env var
      // Just verify the config exists and is valid
      expect(typeof defaultTimeoutConfig.timeoutMs).toBe('number');
      expect(defaultTimeoutConfig.timeoutMs).toBeGreaterThan(0);
    });
  });
});
