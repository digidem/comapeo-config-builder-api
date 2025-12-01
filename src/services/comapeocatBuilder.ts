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
  CategoryInput,
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
  warnings: string[];
}

interface NormalizedTranslationEntry {
  originalTag: string;
  normalizedTag?: string;
  payload: Record<string, unknown>;
}

interface NormalizedTranslationsResult {
  entries: NormalizedTranslationEntry[];
  warnings: string[];
}

export async function buildComapeoCatV2(payload: BuildRequestV2): Promise<BuildResultV2> {
  // Layer 2 Defense: Validate payload size after parsing (defense-in-depth)
  // Layer 1 enforces size during streaming in app.ts onParse hook
  enforcePayloadSize(payload);
  enforceEntryCap(payload);
  enforceUniqueIds(payload.fields, 'field');
  enforceUniqueIds(payload.categories, 'category');
  if (Array.isArray(payload.icons) && payload.icons.length > 0) {
    enforceUniqueIds(payload.icons, 'icon');
  }
  validateCategoryFieldReferences(payload.categories, payload.fields);

  const mapped = await transformPayload(payload);
  const warnings: string[] = [...mapped.warnings];

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

  if (mapped.translations.length > 0) {
    const translationWarnings = await addTranslationsWithFallback(writer, mapped.translations);
    if (translationWarnings.length > 0) {
      warnings.push(...translationWarnings);
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

    return { outputPath, fileName, warnings };
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

  const translationResult = payload.translations
    ? normalizeTranslations(payload.translations, fields)
    : { entries: [], warnings: [] };

  return {
    icons,
    fields,
    categories,
    categorySelection,
    translations: translationResult.entries,
    warnings: translationResult.warnings,
  };
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

function normalizeTranslations(
  translations: Record<string, unknown>,
  fields: MappedField[]
): NormalizedTranslationsResult {
  const fieldOptionLookup = new Map<string, Array<{ label: string; value: unknown }>>();
  for (const field of fields) {
    fieldOptionLookup.set(field.id, field.definition.options || []);
  }

  const entries: NormalizedTranslationEntry[] = [];
  const warnings: string[] = [];

  for (const [lang, value] of Object.entries(translations)) {
    const normalized = tryNormalizeLocale(lang);

    if (!isPlainObject(value)) {
      const size = Buffer.byteLength(JSON.stringify(value), 'utf-8');
      if (size > config.jsonByteLimit) {
        throw new ValidationError(`Translations for ${lang} exceed ${config.jsonByteLimit} bytes`);
      }
      entries.push({ originalTag: lang, normalizedTag: normalized, payload: value as Record<string, unknown> });
      continue;
    }

    const transformed = transformLocaleTranslations(value as Record<string, unknown>, fieldOptionLookup);
    const size = Buffer.byteLength(JSON.stringify(transformed), 'utf-8');
    if (size > config.jsonByteLimit) {
      throw new ValidationError(`Translations for ${lang} exceed ${config.jsonByteLimit} bytes`);
    }
    entries.push({
      originalTag: lang,
      normalizedTag: normalized,
      payload: transformed,
    });
  }

  return { entries, warnings };
}

function tryNormalizeLocale(tag: string) {
  return safeValidateLocale(tag) ?? safeValidateLocale(tag.replace(/_/g, '-'));
}

interface LocaleCandidate {
  value: string;
  reason?: string;
}

async function addTranslationsWithFallback(
  writer: Writer,
  entries: NormalizedTranslationEntry[]
) {
  const warnings: string[] = [];

  for (const entry of entries) {
    const candidates = buildLocaleCandidates(entry);
    let added = false;
    let lastLocaleError: Error | undefined;

    for (const candidate of candidates) {
      try {
        await writer.addTranslations(candidate.value, entry.payload as Record<string, Record<string, string>>);
        if (candidate.reason) {
          warnings.push(
            `Translations for "${entry.originalTag}" were stored as "${candidate.value}" (${candidate.reason}).`
          );
        } else if (candidate.value !== entry.normalizedTag) {
          warnings.push(
            `Translations for "${entry.originalTag}" were stored as "${candidate.value}" (auto-normalized).`
          );
        }
        added = true;
        break;
      } catch (error) {
        if (isLocaleValidationError(error)) {
          lastLocaleError = error as Error;
          continue;
        }
        throw error;
      }
    }

    if (!added) {
      warnings.push(
        `Skipped translations for "${entry.originalTag}": ${lastLocaleError?.message ?? 'Locale validation failed'}`
      );
    }
  }

  return warnings;
}

function buildLocaleCandidates(entry: NormalizedTranslationEntry): LocaleCandidate[] {
  const seen = new Set<string>();
  const candidates: LocaleCandidate[] = [];

  const addCandidate = (value: string | undefined, reason?: string) => {
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    candidates.push({ value, reason });
  };

  if (entry.normalizedTag) {
    const reason = entry.normalizedTag !== entry.originalTag ? 'auto-normalized locale tag' : undefined;
    addCandidate(entry.normalizedTag, reason);
  }

  const sanitized = sanitizeLocaleFormat(entry.originalTag);
  if (sanitized) {
    addCandidate(sanitized.value, sanitized.reason);
  }

  const aliasFromOriginal = getAliasLocale(entry.originalTag);
  if (aliasFromOriginal) {
    addCandidate(aliasFromOriginal, `alias mapped from "${entry.originalTag}"`);
  }

  const aliasFromNormalized = getAliasLocale(entry.normalizedTag);
  if (aliasFromNormalized) {
    addCandidate(aliasFromNormalized, `alias mapped from "${entry.normalizedTag}"`);
  }

  const likelyLocale = deriveLikelyLocale(entry);
  if (likelyLocale) {
    addCandidate(likelyLocale.value, likelyLocale.reason);
  }

  const regionFallback = deriveRegionFallback(entry);
  if (regionFallback) {
    addCandidate(regionFallback.value, regionFallback.reason);
  }

  return candidates;
}

function getAliasLocale(tag: string | undefined) {
  if (!tag) return undefined;
  const alias = config.localeAliases?.[tag.toLowerCase()];
  if (!alias) return undefined;
  return safeValidateLocale(alias);
}

function sanitizeLocaleFormat(tag: string): LocaleCandidate | undefined {
  if (!tag || !tag.includes('_')) return undefined;
  const replaced = tag.replace(/_/g, '-');
  if (replaced === tag) return undefined;
  const validated = safeValidateLocale(replaced);
  if (!validated) return undefined;
  return {
    value: validated,
    reason: 'replaced underscores with hyphens to form a valid locale',
  };
}

function deriveLikelyLocale(entry: NormalizedTranslationEntry): LocaleCandidate | undefined {
  const region = extractRegionSubtag(entry.originalTag);
  if (!region) return undefined;

  try {
    // Use Intl.Locale maximize to infer the most likely language/script for the region
    const locale = new Intl.Locale('und', { region });
    const maximized = locale.maximize();
    const candidate = maximized?.toString();
    const validated = safeValidateLocale(candidate);
    if (validated) {
      return {
        value: validated,
        reason: `derived likely locale using Intl.Locale for region ${region}`,
      };
    }
  } catch {
    // Ignore environments without Intl.Locale support or invalid inputs
  }

  return undefined;
}

function deriveRegionFallback(entry: NormalizedTranslationEntry): LocaleCandidate | undefined {
  const regionSource =
    (entry.normalizedTag && !entry.normalizedTag.includes('-') && entry.normalizedTag) ||
    extractRegionSubtag(entry.originalTag);

  if (!regionSource) {
    return undefined;
  }

  if (/^[A-Za-z]{2}$/.test(regionSource)) {
    const fallback = `und-${regionSource.toUpperCase()}`;
    const validated = safeValidateLocale(fallback);
    if (validated) {
      return {
        value: validated,
        reason: `added neutral language for region tag derived from "${entry.originalTag}"`,
      };
    }
  }

  if (/^\d{3}$/.test(regionSource)) {
    const fallback = `und-${regionSource}`;
    const validated = safeValidateLocale(fallback);
    if (validated) {
      return {
        value: validated,
        reason: `added neutral language for numeric region tag derived from "${entry.originalTag}"`,
      };
    }
  }

  return undefined;
}

function extractRegionSubtag(tag: string) {
  if (!tag) return undefined;
  const trimmed = tag.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const normalized = trimmed.replace(/_/g, '-');
  const parts = normalized.split('-');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }
    if (/^\d{3}$/.test(part)) {
      return part;
    }
  }

  return undefined;
}

function safeValidateLocale(tag: string) {
  try {
    return validateBcp47(tag);
  } catch {
    return undefined;
  }
}

function isLocaleValidationError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: string }).message;
  if (!message) return false;
  return (
    message.includes('Invalid primary language subtag') ||
    message.includes('Invalid region subtag') ||
    message.includes('Invalid BCP 47 tag')
  );
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
          const newKey = `options[value="${escapedValue}"].label`;
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

function enforceUniqueIds<T extends { id?: string }>(items: T[], entityName: string) {
  const seen = new Set<string>();

  for (const item of items) {
    const rawId = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!rawId) {
      throw new ValidationError(`${entityName} id must be a non-empty string`);
    }

    if (seen.has(rawId)) {
      throw new ValidationError(`Duplicate ${entityName} id detected: ${rawId}`);
    }

    seen.add(rawId);
  }
}

function validateCategoryFieldReferences(categories: CategoryInput[], fields: FieldInput[]) {
  const fieldIds = new Set(fields.map((field) => field.id).filter((id): id is string => Boolean(id)));
  const issues: string[] = [];

  for (const category of categories) {
    const refs = new Set<string>();

    if (Array.isArray(category.fields)) {
      for (const ref of category.fields) {
        if (typeof ref === 'string' && ref.trim()) {
          refs.add(ref.trim());
        }
      }
    }

    if (Array.isArray(category.defaultFieldIds)) {
      for (const ref of category.defaultFieldIds) {
        if (typeof ref === 'string' && ref.trim()) {
          refs.add(ref.trim());
        }
      }
    }

    if (refs.size === 0) {
      continue;
    }

    const missing = Array.from(refs).filter((ref) => !fieldIds.has(ref));
    if (missing.length > 0) {
      issues.push(`${category.id}: ${missing.join(', ')}`);
    }
  }

  if (issues.length > 0) {
    throw new ValidationError(
      `Categories reference unknown field ids. Missing references -> ${issues.join(' | ')}`
    );
  }
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
  enforceUniqueIds,
  validateCategoryFieldReferences,
  sanitizePathComponent,
  decodeDataUri,
  normalizeIconId,
  resolveIcon,
  normalizeTranslations,
};
