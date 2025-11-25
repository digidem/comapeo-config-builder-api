import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import { buildSettingsV1 } from '../../../services/settingsBuilder';
import fs from 'fs/promises';

describe('SettingsBuilder - Build Tests', () => {
  let mkdtempSpy: any;
  let rmSpy: any;

  beforeEach(() => {
    // Mock fs functions
    mkdtempSpy = spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/comapeo-settings-test-123456');
    rmSpy = spyOn(fs, 'rm').mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore original implementations to prevent mock leakage
    mkdtempSpy?.mockRestore();
    rmSpy?.mockRestore();
  });

  it('should export buildSettings function', () => {
    expect(typeof buildSettingsV1).toBe('function');
  });
});
