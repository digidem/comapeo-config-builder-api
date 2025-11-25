import { describe, it, expect } from 'bun:test';
import { handleBuildSettingsV1, handleBuildSettingsV2 } from '../../../controllers/settingsController';

describe('Settings Controller', () => {
  it('should export handleBuildSettingsV1 function', () => {
    expect(typeof handleBuildSettingsV1).toBe('function');
  });

  it('should export handleBuildSettingsV2 function', () => {
    expect(typeof handleBuildSettingsV2).toBe('function');
  });
});
