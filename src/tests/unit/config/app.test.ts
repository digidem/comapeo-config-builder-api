import { describe, it, expect } from 'bun:test';
import { createApp } from '../../../config/app';

describe('App Configuration', () => {
  it('should create an Elysia app', () => {
    // Create app
    const app = createApp();

    // Verify app was created
    expect(app).toBeDefined();
  });
});
