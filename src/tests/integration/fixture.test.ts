import { describe, expect, it } from 'bun:test';
import fixture from '../../../fixtures/fixture.json';
import { buildComapeoCatV2 } from '../../services/comapeocatBuilder';
import { Reader } from 'comapeocat';
import fs from 'fs/promises';

describe('Fixture Smoke Test', () => {
  it('should build and validate the fixture successfully', async () => {
    // Build the settings from the fixture
    const result = await buildComapeoCatV2(fixture as any);
    
    expect(result).toBeDefined();
    expect(result.outputPath).toBeDefined();
    
    // Validate the generated file using comapeocat Reader
    const reader = new Reader(result.outputPath);
    const validationResult = await reader.validate();

    const errors = Array.isArray(validationResult) ? validationResult : [];

    if (errors.length > 0) {
      const message = errors.map(e => `${e.message} at ${e.filePath || 'unknown'}`).join('\n');
      console.error('Validation Errors:\n', message);
    }

    expect(errors).toHaveLength(0);
    
    // Cleanup
    await fs.rm(result.outputPath).catch(() => {});
  });
});
