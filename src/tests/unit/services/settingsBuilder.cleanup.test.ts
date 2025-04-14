import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
import { SettingsBuilderService } from '../../../services/settingsBuilder';
import fs from 'fs/promises';

describe('SettingsBuilderService - Cleanup Tests', () => {
  let service: SettingsBuilderService;
  let requestId: string;

  beforeEach(() => {
    service = new SettingsBuilderService();
    requestId = 'test-request-id';

    // Mock fs.rm
    spyOn(fs, 'rm').mockResolvedValue(undefined);
  });

  it('should clean up temporary directory', async () => {
    // Call cleanup
    await service.cleanup('/tmp/test-dir', requestId);

    // Verify rm was called with correct parameters
    expect(fs.rm).toHaveBeenCalledWith('/tmp/test-dir', { recursive: true, force: true });
  });

  it('should handle errors during cleanup', async () => {
    // Mock fs.rm to throw an error
    (fs.rm as any).mockRejectedValueOnce(new Error('Cleanup failed'));

    // Call cleanup (should not throw)
    await service.cleanup('/tmp/test-dir', requestId);

    // Verify rm was called
    expect(fs.rm).toHaveBeenCalled();
  });

  it('should do nothing if tmpDir is empty', async () => {
    // Reset the mock to clear previous calls
    (fs.rm as any).mockClear();

    // Call cleanup with empty string
    await service.cleanup('', requestId);

    // Verify rm was not called
    expect(fs.rm).not.toHaveBeenCalled();
  });
});
