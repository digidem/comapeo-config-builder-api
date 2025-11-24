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
