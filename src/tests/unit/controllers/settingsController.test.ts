import { describe, it, expect } from 'bun:test';
import { settingsController } from '../../../controllers/settingsController';

describe('Settings Controller', () => {
  it('should be a function', () => {
    expect(typeof settingsController).toBe('function');
  });
});
