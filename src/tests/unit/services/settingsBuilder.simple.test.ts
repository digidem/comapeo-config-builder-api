import { describe, it, expect, mock, spyOn } from 'bun:test';
import { SettingsBuilderService } from '../../../services/settingsBuilder';
import { ValidationError, ProcessingError } from '../../../types/errors';
import fs from 'fs/promises';

describe('SettingsBuilderService - Simple Tests', () => {
  it('should have buildSettings method', () => {
    const service = new SettingsBuilderService();
    expect(typeof service.buildSettings).toBe('function');
  });
  
  it('should have cleanup method', () => {
    const service = new SettingsBuilderService();
    expect(typeof service.cleanup).toBe('function');
  });
  
  it('should throw ValidationError if file is not provided', async () => {
    const service = new SettingsBuilderService();
    await expect(service.buildSettings(null as any, 'test-id'))
      .rejects
      .toThrow(ValidationError);
  });
  
  it('should call fs.rm during cleanup', async () => {
    // Mock fs.rm
    const rmMock = mock(async () => {});
    spyOn(fs, 'rm').mockImplementation(rmMock);
    
    // Call cleanup
    const service = new SettingsBuilderService();
    await service.cleanup('/tmp/test', 'test-id');
    
    // Verify rm was called
    expect(rmMock).toHaveBeenCalled();
  });
});
