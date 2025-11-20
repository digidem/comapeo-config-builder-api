import { describe, it, expect } from 'bun:test';
import { healthController } from '../../../controllers/healthController';

describe('Health Controller', () => {
  it('should be a function', () => {
    expect(typeof healthController).toBe('function');
  });
});
