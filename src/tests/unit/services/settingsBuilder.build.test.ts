import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
import { SettingsBuilderService } from '../../../services/settingsBuilder';
import { ValidationError } from '../../../types/errors';
import fs from 'fs/promises';

describe('SettingsBuilderService - Build Tests', () => {
  let service: SettingsBuilderService;
  let requestId: string;

  beforeEach(() => {
    service = new SettingsBuilderService();
    requestId = 'test-request-id';

    // Mock fs functions
    spyOn(fs, 'mkdtemp').mockResolvedValue('/tmp/comapeo-settings-test-request-id-123456');
    spyOn(fs, 'rm').mockResolvedValue(undefined);
  });

  it('should throw ValidationError if file is not provided', async () => {
    await expect(service.buildSettings(null as any, requestId))
      .rejects
      .toThrow(ValidationError);
  });
});
