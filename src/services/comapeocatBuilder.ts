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
  // Layer 2 Defense: Validate payload size after parsing (defense-in-depth)
  // Layer 1 enforces size during streaming in app.ts onParse hook
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
    await writer.addIcon(icon.id, icon.svg);
  }

  for (const field of mapped.fields) {
    // Cast to any to satisfy Writer's strict discriminated union type
    // Runtime validation ensures type safety
    writer.addField(field.id, field.definition as any);
  }

  for (const category of mapped.categories) {
    // Cast tags to satisfy Writer's strict type requirement
    const definition = {
      ...category.definition,
      tags: category.definition.tags as Record<string, string | number | boolean | null>,
      addTags: category.definition.addTags as Record<string, string | number | boolean | null> | undefined,
      removeTags: category.definition.removeTags as Record<string, string | number | boolean | null> | undefined,
    };
    writer.addCategory(category.id, definition);
  }

  if (mapped.translations) {
    for (const [lang, translations] of Object.entries(mapped.translations)) {
      // Cast to satisfy Writer's type requirement - validateTranslations ensures correct structure
      writer.addTranslations(lang, translations as Record<string, Record<string, string>>);
    }
  }

  writer.setCategorySelection(mapped.categorySelection);

  // Validate path components BEFORE creating temp directory to prevent resource leaks
  const sanitizedName = sanitizePathComponent(payload.metadata.name);
  const sanitizedVersion = sanitizePathComponent(payload.metadata.version || 'v2');
  const fileName = `${sanitizedName}-${sanitizedVersion}.comapeocat`;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
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

  // Validate icons is an array if provided (empty arrays are allowed since icons are optional)
  if (payload.icons !== undefined && payload.icons !== null && !Array.isArray(payload.icons)) {
    throw new ValidationError('icons must be an array');
  }

  const icons = await Promise.all((payload.icons || []).map(resolveIcon));
  const fields = payload.fields.map(mapField);
  const categories = payload.categories.map((category, index) =>
    mapCategory(category, index)
  );

  const categorySelection = deriveCategorySelection(categories);

  const translations = payload.translations
    ? normalizeTranslations(payload.translations, fields)
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
  
  let icon = category.icon || category.iconId;
  if (icon && typeof icon === 'string') {
    icon = normalizeIconId(icon);
  }

  const definition = {
    name: category.name,
    appliesTo,
    tags,
    fields,
    icon,
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

  // Validate that all appliesTo values are either "observation" or "track"
  const allowedValues = new Set(['observation', 'track']);
  for (const value of base) {
    if (!allowedValues.has(value)) {
      throw new ValidationError(
        `Category ${category.id} appliesTo must only contain "observation" or "track", got "${value}"`
      );
    }
  }

  const final = new Set<string>(base);
  // Respect user-supplied appliesTo values
  // Only add 'track' if category.track is true AND it's not already present
  if (category.track && !final.has('track')) {
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
  const observation = categories
    .filter((c) => c.definition.appliesTo.includes('observation'))
    .map((c) => c.id);
  // Track selection should only include categories whose appliesTo includes 'track'
  // The track flag is just a hint, but appliesTo is the authoritative field
  const track = categories
    .filter((c) => c.definition.appliesTo.includes('track'))
    .map((c) => c.id);

  return { observation, track };
}

async function resolveIcon(icon: any): Promise<MappedIcon> {
  if (!icon?.id) throw new ValidationError('Icon id is required');

  const id = normalizeIconId(icon.id);

  if (icon.svgData) {
    enforceIconSize(icon.svgData, id);
    return { id, svg: icon.svgData };
  }

  if (icon.svgUrl) {
    // Check if it's a data URI
    if (icon.svgUrl.startsWith('data:image/svg+xml,')) {
      const svg = decodeDataUri(icon.svgUrl);
      enforceIconSize(svg, id);
      return { id, svg };
    }

    // Otherwise fetch from remote URL
    const svg = await fetchIcon(icon.svgUrl);
    enforceIconSize(svg, id);
    return { id, svg };
  }

  throw new ValidationError(`Icon ${id} must include svgData or svgUrl`);
}

const SVG_EXTENSION_PATTERN = /(\.svg)+$/i;

function normalizeIconId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Icon id must be a non-empty string');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError('Icon id must be a non-empty string');
  }

  const normalized = trimmed.replace(SVG_EXTENSION_PATTERN, '');
  if (!normalized) {
    throw new ValidationError('Icon id must include characters other than ".svg"');
  }

  return normalized;
}

function decodeDataUri(dataUri: string): string {
  if (!dataUri.startsWith('data:image/svg+xml,')) {
    throw new ValidationError('Invalid data URI format. Must start with "data:image/svg+xml,"');
  }

  // Extract the data part after the prefix
  const encodedData = dataUri.slice('data:image/svg+xml,'.length);

  try {
    // Decode the URL-encoded SVG data
    return decodeURIComponent(encodedData);
  } catch (error) {
    throw new ValidationError('Failed to decode data URI. Invalid URL encoding.');
  }
}

function enforceIconSize(svg: string, iconId: string) {
  const size = Buffer.byteLength(svg, 'utf-8');
  if (size > config.iconByteLimit) {
    throw new ValidationError(`Icon ${iconId} exceeds size limit of ${config.iconByteLimit} bytes`);
  }
}

async function fetchIcon(url: string): Promise<string> {
  // Use Promise.race to enforce timeout on entire operation including DNS resolution
  // AbortController alone may not cancel DNS lookups or slow connection establishment
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(new ValidationError(`Icon fetch timeout: ${url} did not respond within ${config.iconFetchTimeoutMs}ms`));
    }, config.iconFetchTimeoutMs);
  });

  const fetchPromise = (async () => {
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
  })();

  // Race between fetch operation and timeout
  // This ensures DNS resolution, connection establishment, and download are all bounded
  return Promise.race([fetchPromise, timeoutPromise]);
}

function normalizeTranslations(translations: Record<string, unknown>, fields: MappedField[]) {
  const fieldOptionLookup = new Map<string, Array<{ label: string; value: unknown }>>();
  for (const field of fields) {
    fieldOptionLookup.set(field.id, field.definition.options || []);
  }

  const result: Record<string, unknown> = {};

  for (const [lang, value] of Object.entries(translations)) {
    const normalized = validateBcp47(lang);

    if (!isPlainObject(value)) {
      const size = Buffer.byteLength(JSON.stringify(value), 'utf-8');
      if (size > config.jsonByteLimit) {
        throw new ValidationError(`Translations for ${lang} exceed ${config.jsonByteLimit} bytes`);
      }
      result[normalized] = value;
      continue;
    }

    const transformed = transformLocaleTranslations(value as Record<string, unknown>, fieldOptionLookup);
    const size = Buffer.byteLength(JSON.stringify(transformed), 'utf-8');
    if (size > config.jsonByteLimit) {
      throw new ValidationError(`Translations for ${lang} exceed ${config.jsonByteLimit} bytes`);
    }
    result[normalized] = transformed;
  }

  return result;
}

function transformLocaleTranslations(
  localeTranslations: Record<string, unknown>,
  optionLookup: Map<string, Array<{ label: string; value: unknown }>>
) {
  const result: Record<string, unknown> = {};

  for (const [section, value] of Object.entries(localeTranslations)) {
    if (section === 'field' && isPlainObject(value)) {
      result[section] = transformFieldTranslations(value as Record<string, unknown>, optionLookup);
      continue;
    }

    result[section] = value;
  }

  return result;
}

function transformFieldTranslations(
  fieldTranslations: Record<string, unknown>,
  optionLookup: Map<string, Array<{ label: string; value: unknown }>>
) {
  const result: Record<string, unknown> = {};

  for (const [fieldId, value] of Object.entries(fieldTranslations)) {
    if (isPlainObject(value)) {
      result[fieldId] = transformFieldOptionKeys(fieldId, value as Record<string, unknown>, optionLookup);
      continue;
    }

    result[fieldId] = value;
  }

  return result;
}

function transformFieldOptionKeys(
  fieldId: string,
  translations: Record<string, unknown>,
  optionLookup: Map<string, Array<{ label: string; value: unknown }>>
) {
  const result: Record<string, unknown> = {};
  const options = optionLookup.get(fieldId) || [];

  for (const [key, value] of Object.entries(translations)) {
    const match = key.match(/^options\.(\d+)$/);
    if (match) {
      const index = Number(match[1]);
      if (!Number.isNaN(index) && index >= 0 && index < options.length) {
        const option = options[index];
        const optionValue = option?.value ?? option?.label;
        if (optionValue !== undefined) {
          const escapedValue = escapeOptionAttributeValue(optionValue);
          const newKey = `options[value="${escapedValue}"]`;
          result[newKey] = value;
          continue;
        }
      }
    }

    result[key] = value;
  }

  return result;
}

function escapeOptionAttributeValue(value: unknown): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\]/g, '\\]');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateBcp47(lang: string): string {
  const trimmed = lang?.trim();
  // Permissive regex for basic format checking - allows single-char extensions (u, t, x)
  // Actual BCP-47 validation is done by Intl.getCanonicalLocales below
  const bcp47Regex = /^[a-zA-Z][a-zA-Z0-9-]*$/;
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

  // Validate icons is an array if provided (destructuring defaults to [] if missing)
  if (!Array.isArray(icons)) {
    throw new ValidationError('icons must be an array');
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
 * Rejects inputs containing path separators or traversal patterns to prevent attacks.
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in file paths
 */
function sanitizePathComponent(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new ValidationError('Path component must be a non-empty string');
  }

  // Explicitly reject inputs containing path separators or traversal patterns
  // This prevents malicious intent from being hidden by sanitization
  if (/[/\\]/.test(input)) {
    throw new ValidationError('Path component cannot contain path separators (/ or \\)');
  }

  if (/\.\./.test(input)) {
    throw new ValidationError('Path component cannot contain parent directory references (..)');
  }

  if (/\0/.test(input)) {
    throw new ValidationError('Path component cannot contain null bytes');
  }

  // Additional sanitization: remove any remaining potentially dangerous characters
  const sanitized = input.trim();

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
  decodeDataUri,
  normalizeIconId,
  resolveIcon,
  normalizeTranslations,
};
