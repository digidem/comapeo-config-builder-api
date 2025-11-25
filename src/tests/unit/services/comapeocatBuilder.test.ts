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
    expect(() => __test__.validateBcp47('not-a-locale')).toThrow(ValidationError);
  });

  it('throws for unsupported field type via builder', async () => {
    const payload = createBasePayload({ fieldTypeOverride: 'weird' as any });
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when appliesTo is missing', async () => {
    const payload = createBasePayload();
    // @ts-expect-error intentional invalid payload
    delete (payload.categories[0] as any).appliesTo;
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when icon exceeds size cap', async () => {
    const payload = createBasePayload();
    payload.icons = [{ id: 'big', svgData: 'a'.repeat(2_000_001) }];
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
  });

  it('throws when translations use invalid locale', async () => {
    const payload = createBasePayload();
    payload.translations = { 'not-a-locale': { label: 'bad' } };
    await expect(buildComapeoCatV2(payload)).rejects.toThrow(ValidationError);
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
