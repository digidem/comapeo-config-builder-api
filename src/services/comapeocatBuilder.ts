import { Writer } from 'comapeocat';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

import { config } from '../config/app';
import { ProcessingError, ValidationError } from '../types/errors';
import type {
  BuildRequestV2,
  ComapeoFieldType,
  FieldInput,
  MappedCategory,
  MappedField,
  MappedIcon,
} from '../types/v2';

const BUILDER_NAME = 'comapeocat';
const BUILDER_VERSION = '1.1.0';

export interface BuildResultV2 {
  outputPath: string;
  fileName: string;
}

export async function buildComapeoCatV2(payload: BuildRequestV2): Promise<BuildResultV2> {
  enforcePayloadSize(payload);
  enforceEntryCap(payload);

  const mapped = await transformPayload(payload);

  const writer = new Writer();

  writer.setMetadata({
    name: payload.metadata.name,
    version: payload.metadata.version,
    builderName: BUILDER_NAME,
    builderVersion: BUILDER_VERSION,
  });

  for (const icon of mapped.icons) {
    writer.addIcon(icon.id, icon.svg);
  }

  for (const field of mapped.fields) {
    writer.addField(field.id, field.definition);
  }

  for (const category of mapped.categories) {
    writer.addCategory(category.id, category.definition);
  }

  if (mapped.translations) {
    for (const [lang, translations] of Object.entries(mapped.translations)) {
      writer.addTranslations(lang, translations);
    }
  }

  writer.setCategorySelection(mapped.categorySelection);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
  const sanitizedName = sanitizePathComponent(payload.metadata.name);
  const sanitizedVersion = sanitizePathComponent(payload.metadata.version || 'v2');
  const fileName = `${sanitizedName}-${sanitizedVersion}.comapeocat`;
  const outputPath = path.join(tmpDir, fileName);

  try {
    // Finalize the Writer BEFORE streaming to ensure archive is complete
    await writer.finish();

    // Now stream the completed archive to file
    const outputStream = normalizeToNodeStream(writer.outputStream);
    await pipeline(outputStream, createWriteStream(outputPath));

    return { outputPath, fileName };
  } catch (error) {
    // Clean up temp directory on failure
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function transformPayload(payload: BuildRequestV2) {
  if (!payload.metadata?.name) {
    throw new ValidationError('metadata.name is required');
  }

  if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
    throw new ValidationError('At least one category is required');
  }

  if (!Array.isArray(payload.fields) || payload.fields.length === 0) {
    throw new ValidationError('At least one field is required');
  }

  const icons = await Promise.all((payload.icons || []).map(resolveIcon));
  const fields = payload.fields.map(mapField);
  const categories = payload.categories.map((category, index) =>
    mapCategory(category, index)
  );

  const categorySelection = deriveCategorySelection(categories);

  const translations = payload.translations
    ? validateTranslations(payload.translations)
    : undefined;

  return { icons, fields, categories, categorySelection, translations };
}

function mapField(field: FieldInput): MappedField {
  if (!field.id) {
    throw new ValidationError('Field id is required');
  }

  const originalType = field.type;
  const mappedType = mapFieldType(originalType);

  const mappedField: MappedField = {
    id: field.id,
    definition: {
      type: mappedType,
      label: field.label || field.name || field.id,
      tagKey: field.tagKey || field.id,
      options: field.options,
      placeholder: field.placeholder,
      helperText: field.helperText,
      appearance: field.appearance,
    },
  };

  if ((originalType === 'date' || originalType === 'datetime') && !mappedField.definition.helperText) {
    mappedField.definition.helperText = 'ISO date';
  }

  if ((originalType === 'date' || originalType === 'datetime') && !mappedField.definition.appearance) {
    mappedField.definition.appearance = 'singleline';
  }

  if ((originalType === 'photo' || originalType === 'location') && !mappedField.definition.helperText) {
    mappedField.definition.helperText = 'Legacy field mapped to text';
  }

  if (originalType === 'boolean' && (!field.options || field.options.length === 0)) {
    mappedField.definition.options = [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ];
  }

  if (mappedType === 'selectOne' || mappedType === 'selectMultiple') {
    if (!field.options || field.options.length === 0) {
      if (!mappedField.definition.options) {
        throw new ValidationError(`Field ${field.id} requires options`);
      }
    }
    if (field.options && field.options.length > 0) {
      mappedField.definition.options = field.options;
    }
  }

  return mappedField;
}

function mapFieldType(type: FieldInput['type']): ComapeoFieldType {
  switch (type) {
    case 'select':
      return 'selectOne';
    case 'multiselect':
      return 'selectMultiple';
    case 'textarea':
      return 'text';
    case 'integer':
      return 'number';
    case 'boolean':
      return 'selectOne';
    case 'date':
    case 'datetime':
    case 'photo':
    case 'location':
      return 'text';
    case 'text':
    case 'number':
    case 'selectOne':
    case 'selectMultiple':
      return type;
    default:
      throw new ValidationError(`Unsupported field type: ${type}`);
  }
}

function mapCategory(category: any, index: number): MappedCategory {
  if (!category?.id) throw new ValidationError(`Category at index ${index} is missing id`);
  if (!category?.name) throw new ValidationError(`Category ${category.id} is missing name`);

  const appliesTo = buildAppliesTo(category);
  const tags = normalizeTags(category.tags, category.id);
  const fields = category.fields || category.defaultFieldIds || [];

  const definition = {
    name: category.name,
    appliesTo,
    tags,
    fields,
    icon: category.icon || category.iconId,
    addTags: category.addTags,
    removeTags: category.removeTags,
    terms: category.terms,
    color: category.color,
  };

  return { id: category.id, definition, track: Boolean(category.track) };
}

function buildAppliesTo(category: any): string[] {
  const base = Array.isArray(category.appliesTo)
    ? category.appliesTo.filter((v: unknown) => typeof v === 'string' && v.length > 0)
    : [];

  if (base.length === 0) {
    throw new ValidationError(`Category ${category.id} must include appliesTo values`);
  }

  const final = new Set<string>(base);
  // Ensure observation is always present per selection rules
  final.add('observation');
  if (category.track) {
    final.add('track');
  }

  return Array.from(final);
}

function normalizeTags(tags: any, categoryId: string): Record<string, unknown> {
  if (!tags) return { categoryId };
  if (Array.isArray(tags)) {
    if (tags.length === 0) return { categoryId };
    return tags.reduce<Record<string, string>>((acc, tag, idx) => {
      acc[`tag${idx}`] = String(tag);
      return acc;
    }, {});
  }
  if (typeof tags === 'object') {
    const keys = Object.keys(tags as Record<string, unknown>);
    if (keys.length === 0) return { categoryId };
    return tags as Record<string, unknown>;
  }
  return { categoryId };
}

function deriveCategorySelection(categories: MappedCategory[]) {
  const observation = categories.map((c) => c.id);
  const track = categories.filter((c) => c.track).map((c) => c.id);

  // If no categories have track=true, default to including all categories in track selection
  // This allows observation-only configs but provides sensible default for track
  if (track.length === 0) {
    console.warn('No categories marked with track=true, defaulting all categories to track selection');
    return { observation, track: observation };
  }

  return { observation, track };
}

async function resolveIcon(icon: any): Promise<MappedIcon> {
  if (!icon?.id) throw new ValidationError('Icon id is required');

  if (icon.svgData) {
    enforceIconSize(icon.svgData, icon.id);
    return { id: icon.id, svg: icon.svgData };
  }

  if (icon.svgUrl) {
    const svg = await fetchIcon(icon.svgUrl);
    enforceIconSize(svg, icon.id);
    return { id: icon.id, svg };
  }

  throw new ValidationError(`Icon ${icon.id} must include svgData or svgUrl`);
}

function enforceIconSize(svg: string, iconId: string) {
  const size = Buffer.byteLength(svg, 'utf-8');
  if (size > config.iconByteLimit) {
    throw new ValidationError(`Icon ${iconId} exceeds size limit of ${config.iconByteLimit} bytes`);
  }
}

async function fetchIcon(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.iconFetchTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new ValidationError(`Failed to fetch icon from ${url}: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('svg') && !contentType.includes('xml') && !contentType.startsWith('text/')) {
      throw new ValidationError('Icon URL must return an SVG');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProcessingError('Icon response did not include a readable body');
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > config.iconByteLimit) {
          throw new ValidationError('Icon download exceeded size limit');
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  } finally {
    clearTimeout(timeout);
  }
}

function validateTranslations(translations: Record<string, unknown>) {
  const result: Record<string, unknown> = {};

  for (const [lang, value] of Object.entries(translations)) {
    const normalized = validateBcp47(lang);
    const size = Buffer.byteLength(JSON.stringify(value), 'utf-8');
    if (size > config.jsonByteLimit) {
      throw new ValidationError(`Translations for ${lang} exceed ${config.jsonByteLimit} bytes`);
    }
    result[normalized] = value;
  }

  return result;
}

function validateBcp47(lang: string): string {
  const trimmed = lang?.trim();
  const bcp47Regex = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;
  if (!trimmed || !bcp47Regex.test(trimmed)) {
    throw new ValidationError(`Invalid locale: ${lang}`);
  }

  try {
    const [normalized] = Intl.getCanonicalLocales([trimmed]);
    if (!normalized) throw new Error('empty');
    return normalized;
  } catch (err) {
    throw new ValidationError(`Invalid locale: ${lang}`);
  }
}

function enforcePayloadSize(payload: BuildRequestV2) {
  const size = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
  if (size > config.jsonByteLimit) {
    throw new ValidationError(`Request JSON exceeds ${config.jsonByteLimit} bytes limit`);
  }
}

function enforceEntryCap(payload: BuildRequestV2) {
  const { categories = [], fields = [], icons = [], translations } = payload;

  // Validate that required arrays are actually arrays before accessing .length or array methods
  if (!Array.isArray(categories)) {
    throw new ValidationError('At least one category is required');
  }

  if (!Array.isArray(fields)) {
    throw new ValidationError('At least one field is required');
  }

  const optionsCount = fields.reduce((sum, f) => sum + (f.options?.length || 0), 0);
  const translationEntries = translations ? countEntries(translations) : 0;
  const total = categories.length + fields.length + icons.length + optionsCount + translationEntries;

  if (total > config.maxEntries) {
    throw new ValidationError(`Payload exceeds maximum entries (${config.maxEntries})`);
  }
}

function countEntries(value: unknown): number {
  const stack: unknown[] = [value];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      count += current.length;
      stack.push(...current);
    } else if (current && typeof current === 'object') {
      const entries = Object.entries(current);
      count += entries.length;
      stack.push(...entries.map(([, v]) => v));
    }
  }
  return count;
}

function normalizeToNodeStream(streamLike: any) {
  if (streamLike instanceof Readable) return streamLike;
  if (streamLike?.getReader) {
    return Readable.fromWeb(streamLike as any);
  }
  if (streamLike?.pipe) return streamLike;
  throw new ProcessingError('Writer outputStream is not readable');
}

/**
 * Sanitizes a string to be safe for use as a path component.
 * Removes path separators and null bytes to prevent path traversal attacks.
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in file paths
 */
function sanitizePathComponent(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new ValidationError('Path component must be a non-empty string');
  }

  // Remove path separators (/, \), parent directory references (..), and null bytes
  const sanitized = input
    .replace(/[/\\]/g, '_')        // Replace path separators with underscore
    .replace(/\.\./g, '_')         // Replace .. with underscore
    .replace(/\0/g, '')            // Remove null bytes
    .trim();

  if (sanitized.length === 0) {
    throw new ValidationError('Path component cannot be empty after sanitization');
  }

  return sanitized;
}

export const __test__ = {
  mapField,
  mapFieldType,
  mapCategory,
  deriveCategorySelection,
  validateBcp47,
  normalizeTags,
  enforcePayloadSize,
  enforceEntryCap,
  sanitizePathComponent,
};
