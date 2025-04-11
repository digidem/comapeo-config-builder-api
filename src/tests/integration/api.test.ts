import { describe, it, expect } from 'bun:test';
import { createApp } from '../../config/app';

describe('API Integration Tests', () => {
  const app = createApp();

  it('should return 200 for health check', async () => {
    const response = await app.handle(new Request('http://localhost/health'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('should return 404 for non-existent routes', async () => {
    const response = await app.handle(new Request('http://localhost/non-existent'));
    expect(response.status).toBe(404);
  });
});
