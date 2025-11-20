/**
 * Rate limiting middleware
 * Implements per-IP rate limiting without external dependencies
 */

import { logger } from '../utils/logger';
import type { Elysia } from 'elysia';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  message?: string;      // Custom error message
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry>;
  private config: RateLimitConfig;
  private cleanupInterval: Timer | null;

  constructor(config: RateLimitConfig) {
    this.requests = new Map();
    this.config = config;
    this.cleanupInterval = null;

    // Start cleanup interval to prevent memory leaks
    this.startCleanup();
  }

  /**
   * Clean up expired entries periodically
   */
  private startCleanup(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, entry] of this.requests.entries()) {
        if (now > entry.resetTime) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.requests.delete(key));

      if (keysToDelete.length > 0) {
        logger.debug('Rate limiter cleanup', { deletedEntries: keysToDelete.length });
      }
    }, 60000); // 1 minute
  }

  /**
   * Check if request should be rate limited
   */
  isRateLimited(identifier: string): { limited: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now > entry.resetTime) {
      // New window or expired window
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.config.windowMs
      });
      return { limited: false };
    }

    if (entry.count >= this.config.maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { limited: true, retryAfter };
    }

    // Increment count
    entry.count++;
    return { limited: false };
  }

  /**
   * Get current usage for identifier
   */
  getUsage(identifier: string): { count: number; limit: number; remaining: number } {
    const entry = this.requests.get(identifier);
    const now = Date.now();

    if (!entry || now > entry.resetTime) {
      return {
        count: 0,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests
      };
    }

    return {
      count: entry.count,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.count)
    };
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Extract client IP from request
 */
function getClientIP(request: Request): string {
  // Check common headers for real IP (behind proxy)
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP;
  }

  // Fallback - note: this won't work in serverless environments
  return 'unknown';
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    const clientIP = getClientIP(request);
    const result = limiter.isRateLimited(clientIP);

    if (result.limited) {
      logger.warn('Rate limit exceeded', {
        clientIP,
        retryAfter: result.retryAfter
      });

      return new Response(
        JSON.stringify({
          error: 'TooManyRequests',
          message: config.message || 'Too many requests, please try again later',
          retryAfter: result.retryAfter
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(result.retryAfter || 60),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + (result.retryAfter || 60))
          }
        }
      );
    }

    // Add rate limit headers to response
    const usage = limiter.getUsage(clientIP);
    const response = await next();

    // Clone response to add headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });

    newResponse.headers.set('X-RateLimit-Limit', String(usage.limit));
    newResponse.headers.set('X-RateLimit-Remaining', String(usage.remaining));

    return newResponse;
  };
}

/**
 * Elysia plugin for rate limiting
 */
export function rateLimitPlugin(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return (app: Elysia) => {
    return app.onBeforeHandle(async ({ request, set }) => {
      const clientIP = getClientIP(request);
      const result = limiter.isRateLimited(clientIP);

      if (result.limited) {
        logger.warn('Rate limit exceeded', {
          clientIP,
          retryAfter: result.retryAfter
        });

        set.status = 429;
        set.headers = {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter || 60),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + (result.retryAfter || 60))
        };

        return {
          error: 'TooManyRequests',
          message: config.message || 'Too many requests, please try again later',
          retryAfter: result.retryAfter
        };
      }

      // Add rate limit headers
      const usage = limiter.getUsage(clientIP);
      set.headers = {
        ...(set.headers || {}),
        'X-RateLimit-Limit': String(usage.limit),
        'X-RateLimit-Remaining': String(usage.remaining)
      };
    });
  };
}

// Default rate limiter configuration
// 100 requests per 15 minutes per IP
export const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  message: 'Too many requests from this IP, please try again later'
};
