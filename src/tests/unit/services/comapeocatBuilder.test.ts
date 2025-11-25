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
  it('removes forward slashes to prevent path traversal', () => {
    const sanitized = __test__.sanitizePathComponent('../tmp/evil');
    expect(sanitized).toBe('__tmp_evil');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('..');
  });

  it('removes backslashes to prevent path traversal on Windows', () => {
    const sanitized = __test__.sanitizePathComponent('..\\tmp\\evil');
    expect(sanitized).toBe('__tmp_evil');
    expect(sanitized).not.toContain('\\');
    expect(sanitized).not.toContain('..');
  });

  it('removes null bytes', () => {
    const sanitized = __test__.sanitizePathComponent('evil\0name');
    expect(sanitized).toBe('evilname');
    expect(sanitized).not.toContain('\0');
  });

  it('handles multiple path separators', () => {
    const sanitized = __test__.sanitizePathComponent('///..//tmp');
    expect(sanitized).toBe('______tmp');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('..');
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

  it('sanitizes malicious path components in metadata', () => {
    // Test that malicious path components are sanitized
    const maliciousName = '../tmp/evil';
    const maliciousVersion = '../../etc/passwd';

    const sanitizedName = __test__.sanitizePathComponent(maliciousName);
    const sanitizedVersion = __test__.sanitizePathComponent(maliciousVersion);

    // Verify sanitization removed path traversal attempts
    expect(sanitizedName).toBe('__tmp_evil');
    expect(sanitizedVersion).toBe('____etc_passwd');

    // Verify the resulting filename would be safe
    const fileName = `${sanitizedName}-${sanitizedVersion}.comapeocat`;
    expect(fileName).toBe('__tmp_evil-____etc_passwd.comapeocat');
    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('\\');
    expect(fileName).not.toContain('..');
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
