import { describe, it, expect, spyOn, mock, beforeEach, afterEach } from 'bun:test';
import { logger } from '../../../middleware/logger';
import { Elysia } from 'elysia';

describe('Logger Middleware', () => {
  let consoleSpy: any;
  let mockApp: any;
  let deriveFn: Function;
  let mockRequest: Request;
  let mockUUID: string;

  beforeEach(() => {
    // Mock console.log
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Mock crypto.randomUUID
    mockUUID = '12345678-1234-1234-1234-123456789012';
    spyOn(crypto, 'randomUUID').mockImplementation(() => mockUUID as `${string}-${string}-${string}-${string}-${string}`);

    // Mock Date.now
    const originalDateNow = Date.now;
    let currentTime = 1000;
    spyOn(Date, 'now').mockImplementation(() => {
      // First call returns start time, second call adds 100ms
      const time = currentTime;
      currentTime += 100;
      return time;
    });

    // Mock Elysia app
    mockApp = {
      derive: (fn: Function) => {
        deriveFn = fn;
        return mockApp;
      }
    };

    // Mock request
    mockRequest = new Request('http://localhost/test');
  });

  afterEach(() => {
    // No cleanup needed, Bun handles this automatically
  });

  it('should add requestId and logResponse to context', () => {
    // Apply logger middleware
    logger(mockApp as unknown as Elysia);

    // Call the derive function with mock request
    const context = deriveFn({ request: mockRequest });

    // Check that requestId is set
    expect(context.requestId).toBe(mockUUID);

    // Check that logResponse is a function
    expect(typeof context.logResponse).toBe('function');
  });

  it('should log request start and completion', () => {
    // Apply logger middleware
    logger(mockApp as unknown as Elysia);

    // Call the derive function with mock request
    const context = deriveFn({ request: mockRequest });

    // Check that start log was called
    expect(consoleSpy).toHaveBeenCalledWith(`[${mockUUID}] GET /test - Started`);

    // Call logResponse
    context.logResponse(200);

    // Check that completion log was called with duration
    expect(consoleSpy).toHaveBeenCalledWith(`[${mockUUID}] GET /test - 200 (100ms)`);
  });
});
