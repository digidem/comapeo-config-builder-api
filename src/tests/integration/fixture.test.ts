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
    
    // If there are validation errors, log them for debugging
    if (Array.isArray(validationResult) && validationResult.length > 0) {
      const errors = validationResult.map(e => `${e.message} at ${e.filePath || 'unknown'}`).join('\n');
      console.error('Validation Errors:\n', errors);
    }
    
    // Expect no validation errors (returns undefined or empty array on success)
    if (validationResult) {
      expect(validationResult).toEqual([]);
    } else {
      expect(validationResult).toBeUndefined();
    }
    
    // Cleanup
    await fs.rm(result.outputPath).catch(() => {});
  });
});
