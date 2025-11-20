import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
import { buildSettings } from '../../../services/settingsBuilder';
import fs from 'fs/promises';

describe('SettingsBuilder - Build Tests', () => {
  beforeEach(() => {
    // Mock fs functions
    spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/comapeo-settings-test-123456');
    spyOn(fs, 'rm').mockResolvedValue(undefined);
  });

  it('should export buildSettings function', () => {
    expect(typeof buildSettings).toBe('function');
  });
});
