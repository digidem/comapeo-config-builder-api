import { describe, it, expect } from 'bun:test';
import { config } from '../../../config/app';

describe('App Configuration', () => {
  it('should have valid configuration', () => {
    // Verify config is defined
    expect(config).toBeDefined();
    expect(config.port).toBeDefined();
    expect(config.tempDirPrefix).toBe('comapeo-settings-');
    expect(config.maxAttempts).toBe(120);
    expect(config.delayBetweenAttempts).toBe(1000);
  });
});
