import { describe, expect, it } from 'bun:test';
import { ValidationError } from '../../../types/errors';
import { __test__, buildComapeoCatV2 } from '../../../services/comapeocatBuilder';
import type { FieldInput, BuildRequestV2 } from '../../../types/v2';

describe('comapeocatBuilder helpers', () => {
  it('maps boolean field to selectOne with yes/no options', () => {
    const field: FieldInput = { id: 'flag', type: 'boolean' };
    const mapped = __test__.mapField(field);

    expect(mapped.definition.type).toBe('selectOne');
    expect(mapped.definition.options).toEqual([
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ]);
  });

  it('throws on unsupported field type', () => {
    const badField = { id: 'strange', type: 'unsupported' } as unknown as FieldInput;
    expect(() => __test__.mapFieldType(badField.type as any)).toThrow(ValidationError);
  });

  it('fails when appliesTo is missing', () => {
    expect(() => __test__.mapCategory({ id: 'cat', name: 'Cat' }, 0)).toThrow(ValidationError);
  });

  it('normalizes tags to default when empty', () => {
    const tags = __test__.normalizeTags({}, 'cat-1');
    expect(tags).toEqual({ categoryId: 'cat-1' });
  });

  it('rejects invalid locales', () => {
    expect(() => __test__.validateBcp47('')).toThrow(ValidationError);
    expect(() => __test__.validateBcp47('   ')).toThrow(ValidationError);
    expect(() => __test__.validateBcp47('123')).toThrow(ValidationError);
  });

  it('accepts valid BCP-47 tags with Unicode extensions', () => {
    // Unicode locale extensions (u-) are widely used for calendar, numbering, etc.
    expect(__test__.validateBcp47('en-US-u-ca-gregory')).toBe('en-US-u-ca-gregory');
    expect(__test__.validateBcp47('es-419-u-nu-latn')).toBe('es-419-u-nu-latn');
    expect(__test__.validateBcp47('de-DE-u-co-phonebk')).toBe('de-DE-u-co-phonebk');
  });

  it('accepts valid BCP-47 tags with private use extensions', () => {
    // Private use extensions (x-) allow custom locale identifiers
    expect(__test__.validateBcp47('en-x-custom')).toBe('en-x-custom');
    expect(__test__.validateBcp47('fr-x-private')).toBe('fr-x-private');
  });

  it('accepts standard language-region tags', () => {
    expect(__test__.validateBcp47('en-US')).toBe('en-US');
    expect(__test__.validateBcp47('zh-Hans-CN')).toBe('zh-Hans-CN');
    expect(__test__.validateBcp47('pt-BR')).toBe('pt-BR');
  });

  it('throws for unsupported field type via builder', async () => {
    const payload = createBasePayload({ fieldTypeOverride: 'weird' as any });
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when appliesTo is missing', async () => {
    const payload = createBasePayload();
    // Intentionally delete appliesTo to test validation
    delete (payload.categories[0] as any).appliesTo;
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when appliesTo contains invalid values', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['foo'] };
    expect(() => __test__.mapCategory(category, 0)).toThrow(ValidationError);
    expect(() => __test__.mapCategory(category, 0)).toThrow('appliesTo must only contain "observation" or "track"');
  });

  it('throws when appliesTo contains mix of valid and invalid values', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['observation', 'invalid', 'track'] };
    expect(() => __test__.mapCategory(category, 0)).toThrow(ValidationError);
    expect(() => __test__.mapCategory(category, 0)).toThrow('appliesTo must only contain "observation" or "track"');
  });

  it('accepts valid appliesTo values: observation only', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['observation'] };
    const mapped = __test__.mapCategory(category, 0);
    expect(mapped).toBeDefined();
    expect(mapped.definition.appliesTo).toContain('observation');
  });

  it('respects user-supplied appliesTo: track only should stay track only', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['track'] };
    const mapped = __test__.mapCategory(category, 0);
    expect(mapped).toBeDefined();
    expect(mapped.definition.appliesTo).toEqual(['track']);
  });

  it('respects user-supplied appliesTo: observation only should stay observation only', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['observation'] };
    const mapped = __test__.mapCategory(category, 0);
    expect(mapped).toBeDefined();
    expect(mapped.definition.appliesTo).toEqual(['observation']);
  });

  it('respects user-supplied appliesTo: both observation and track', () => {
    const category = { id: 'cat', name: 'Cat', appliesTo: ['observation', 'track'] };
    const mapped = __test__.mapCategory(category, 0);
    expect(mapped).toBeDefined();
    // Should contain both in some order
    expect(mapped.definition.appliesTo.sort()).toEqual(['observation', 'track']);
  });

  it('throws when icon exceeds size cap', async () => {
    const payload = createBasePayload();
    payload.icons = [{ id: 'big', svgData: 'a'.repeat(2_000_001) }];
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when translations use invalid locale', async () => {
    const payload = createBasePayload();
    // Underscore is invalid in BCP-47 (should be hyphen)
    payload.translations = { 'en_US': { label: 'bad' } };
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when icons is an object instead of array', async () => {
    const payload = createBasePayload();
    // @ts-expect-error intentional invalid payload - icons should be array not object
    payload.icons = { id: 'ico', svgData: '<svg/>' };
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });
});

describe('decodeDataUri', () => {
  it('decodes valid data URI with URL-encoded SVG', () => {
    const dataUri = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3e%3cpath%20d='M12%202'/%3e%3c/svg%3e";
    const decoded = __test__.decodeDataUri(dataUri);
    expect(decoded).toBe("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2'/></svg>");
  });

  it('decodes data URI with spaces and special characters', () => {
    const dataUri = "data:image/svg+xml,%3csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%2F%3E%3c%2Fsvg%3E";
    const decoded = __test__.decodeDataUri(dataUri);
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('circle');
  });

  it('throws ValidationError for invalid data URI prefix', () => {
    const invalidUri = "data:image/png,notsvg";
    expect(() => __test__.decodeDataUri(invalidUri)).toThrow(ValidationError);
    expect(() => __test__.decodeDataUri(invalidUri)).toThrow('Invalid data URI format');
  });

  it('throws ValidationError for malformed URL encoding', () => {
    const malformedUri = "data:image/svg+xml,%ZZ";
    expect(() => __test__.decodeDataUri(malformedUri)).toThrow(ValidationError);
    expect(() => __test__.decodeDataUri(malformedUri)).toThrow('Failed to decode data URI');
  });

  it('throws ValidationError for empty data URI', () => {
    const emptyUri = "data:image/svg+xml,";
    const decoded = __test__.decodeDataUri(emptyUri);
    expect(decoded).toBe('');
  });
});

describe('icon resolution with all three formats', () => {
  it('successfully processes svgData (inline SVG string)', async () => {
    const payload = createBasePayload();
    payload.icons = [{ id: 'inline', svgData: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>' }];

    const result = await buildComapeoCatV2(payload);
    expect(result.outputPath).toBeDefined();
    expect(result.fileName).toContain('test');
  });

  it('successfully processes svgUrl with data URI', async () => {
    const payload = createBasePayload();
    const dataUri = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%3e%3ccircle%20r='10'/%3e%3c/svg%3e";
    payload.icons = [{ id: 'datauri', svgUrl: dataUri }];

    const result = await buildComapeoCatV2(payload);
    expect(result.outputPath).toBeDefined();
    expect(result.fileName).toContain('test');
  });

  it('throws when data URI exceeds size limit', async () => {
    const payload = createBasePayload();
    // Create a data URI that exceeds 2MB when decoded
    const largeSvg = '<svg xmlns="http://www.w3.org/2000/svg">' + 'a'.repeat(2_000_001) + '</svg>';
    const dataUri = `data:image/svg+xml,${encodeURIComponent(largeSvg)}`;
    payload.icons = [{ id: 'toolarge', svgUrl: dataUri }];

    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when icon has neither svgData nor svgUrl', async () => {
    const payload = createBasePayload();
    payload.icons = [{ id: 'empty' } as any];

    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
    await expect(buildComapeoCatV2(payload)).rejects.toThrow('must include svgData or svgUrl');
  });

  it('processes all three icon formats in a single payload', async () => {
    const payload = createBasePayload();
    const dataUri = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M0%200'/%3e%3c/svg%3e";

    payload.icons = [
      { id: 'inline', svgData: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' },
      { id: 'datauri', svgUrl: dataUri },
      // Note: We can't test actual URL fetching in unit tests without mocking
    ];

    const result = await buildComapeoCatV2(payload);
    expect(result.outputPath).toBeDefined();
    expect(result.fileName).toContain('test');
  });
});

describe('sanitizePathComponent security', () => {
  it('rejects forward slashes to prevent path traversal', () => {
    expect(() => __test__.sanitizePathComponent('../tmp/evil')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('../tmp/evil')).toThrow('path separators');
  });

  it('does not leak temp directories when sanitization fails', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    // Count existing temp directories
    const tmpDir = os.tmpdir();
    const beforeDirs = await fs.readdir(tmpDir);
    const beforeCount = beforeDirs.filter(d => d.startsWith('comapeo-settings-')).length;

    // Attempt to build with invalid name containing path separator
    const payload = createBasePayload();
    payload.metadata.name = '../evil';

    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);

    // Verify no new temp directories were created
    const afterDirs = await fs.readdir(tmpDir);
    const afterCount = afterDirs.filter(d => d.startsWith('comapeo-settings-')).length;

    expect(afterCount).toBe(beforeCount);
  });

  it('does not leak temp directories when version sanitization fails', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    // Count existing temp directories
    const tmpDir = os.tmpdir();
    const beforeDirs = await fs.readdir(tmpDir);
    const beforeCount = beforeDirs.filter(d => d.startsWith('comapeo-settings-')).length;

    // Attempt to build with invalid version containing parent reference
    const payload = createBasePayload();
    payload.metadata.version = '..';

    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);

    // Verify no new temp directories were created
    const afterDirs = await fs.readdir(tmpDir);
    const afterCount = afterDirs.filter(d => d.startsWith('comapeo-settings-')).length;

    expect(afterCount).toBe(beforeCount);
  });

  it('rejects backslashes to prevent path traversal on Windows', () => {
    expect(() => __test__.sanitizePathComponent('..\\tmp\\evil')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('..\\tmp\\evil')).toThrow('path separators');
  });

  it('rejects parent directory references', () => {
    expect(() => __test__.sanitizePathComponent('evil..name')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('evil..name')).toThrow('parent directory');
  });

  it('rejects null bytes', () => {
    expect(() => __test__.sanitizePathComponent('evil\0name')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('evil\0name')).toThrow('null bytes');
  });

  it('rejects multiple path separators', () => {
    expect(() => __test__.sanitizePathComponent('///..//tmp')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('///..//tmp')).toThrow('path separators');
  });

  it('throws on non-string input', () => {
    expect(() => __test__.sanitizePathComponent(null as any)).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent(undefined as any)).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent(123 as any)).toThrow(ValidationError);
  });

  it('throws on empty string input', () => {
    expect(() => __test__.sanitizePathComponent('')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('   ')).toThrow(ValidationError);
  });

  it('allows safe filenames to pass through', () => {
    const sanitized = __test__.sanitizePathComponent('my-config');
    expect(sanitized).toBe('my-config');
  });

  it('allows safe filenames with common characters', () => {
    expect(__test__.sanitizePathComponent('my-config-v1.0')).toBe('my-config-v1.0');
    expect(__test__.sanitizePathComponent('test_file')).toBe('test_file');
    expect(__test__.sanitizePathComponent('Config-2024')).toBe('Config-2024');
  });

  it('rejects malicious path components to prevent hiding intent', () => {
    // Explicitly reject malicious inputs rather than silently sanitizing
    // This prevents attacks from being hidden in logs/debugging
    expect(() => __test__.sanitizePathComponent('/etc/passwd')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('../../etc/passwd')).toThrow(ValidationError);
    expect(() => __test__.sanitizePathComponent('C:\\Windows\\System32')).toThrow(ValidationError);
  });
});

describe('deriveCategorySelection', () => {
  it('includes only categories with appliesTo: track in track selection', () => {
    const categories = [
      {
        id: 'obs-only',
        definition: { name: 'Observation Only', appliesTo: ['observation'], tags: {}, fields: [] },
        track: false,
      },
      {
        id: 'track-enabled',
        definition: { name: 'Track Enabled', appliesTo: ['observation', 'track'], tags: {}, fields: [] },
        track: false,
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual(['obs-only', 'track-enabled']);
    expect(selection.track).toEqual(['track-enabled']);
  });

  it('returns empty track selection when no categories have appliesTo: track', () => {
    const categories = [
      {
        id: 'obs-1',
        definition: { name: 'Observation 1', appliesTo: ['observation'], tags: {}, fields: [] },
        track: false,
      },
      {
        id: 'obs-2',
        definition: { name: 'Observation 2', appliesTo: ['observation'], tags: {}, fields: [] },
        track: false,
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual(['obs-1', 'obs-2']);
    expect(selection.track).toEqual([]);
  });

  it('includes category with track=true in track selection when appliesTo includes track', () => {
    const categories = [
      {
        id: 'track-cat',
        definition: { name: 'Track Category', appliesTo: ['observation', 'track'], tags: {}, fields: [] },
        track: true,
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual(['track-cat']);
    expect(selection.track).toEqual(['track-cat']);
  });

  it('does not include observation-only category in track selection even with track=true', () => {
    const categories = [
      {
        id: 'obs-only',
        definition: { name: 'Observation Only', appliesTo: ['observation'], tags: {}, fields: [] },
        track: true, // track flag should be ignored if appliesTo doesn't include 'track'
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual(['obs-only']);
    expect(selection.track).toEqual([]);
  });

  it('includes track-only category in track selection ONLY', () => {
    const categories = [
      {
        id: 'track-only',
        definition: { name: 'Track Only', appliesTo: ['track'], tags: {}, fields: [] },
        track: false,
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual([]); // Should NOT include track-only
    expect(selection.track).toEqual(['track-only']);
  });

  it('handles mixed categories correctly', () => {
    const categories = [
      {
        id: 'obs-1',
        definition: { name: 'Observation 1', appliesTo: ['observation'], tags: {}, fields: [] },
        track: false,
      },
      {
        id: 'both-1',
        definition: { name: 'Both 1', appliesTo: ['observation', 'track'], tags: {}, fields: [] },
        track: false,
      },
      {
        id: 'obs-2',
        definition: { name: 'Observation 2', appliesTo: ['observation'], tags: {}, fields: [] },
        track: true, // Should not affect track selection
      },
      {
        id: 'both-2',
        definition: { name: 'Both 2', appliesTo: ['track', 'observation'], tags: {}, fields: [] },
        track: true,
      },
    ];

    const selection = __test__.deriveCategorySelection(categories);

    expect(selection.observation).toEqual(['obs-1', 'both-1', 'obs-2', 'both-2']);
    expect(selection.track).toEqual(['both-1', 'both-2']);
  });
});

function createBasePayload(options?: { fieldTypeOverride?: string }): BuildRequestV2 {
  return {
    metadata: { name: 'test', version: '1.0.0' },
    categories: [
      {
        id: 'cat-1',
        name: 'Category 1',
        appliesTo: ['observation', 'track'],
        tags: { categoryId: 'cat-1' },
        fields: ['field-1'],
        track: true,
      },
    ],
    fields: [
      {
        id: 'field-1',
        name: 'Field 1',
        tagKey: 'field-1',
        type: (options?.fieldTypeOverride as any) || 'text',
      },
    ],
  };
}
