import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Reader } from 'comapeocat'; // Added Reader import
import { buildSettingsV1 } from '../services/settingsBuilder';
import { buildComapeoCatV2 } from '../services/comapeocatBuilder';
import { ValidationError, ProcessingError } from '../types/errors';
import type { BuildRequestV2, IconInput } from '../types/v2';
import { config } from '../config/app';

/**
 * Handle v1 request to build settings from a ZIP file
 * @param file The uploaded ZIP file
 * @returns The built .comapeocat file or an error response
 */
export async function handleBuildSettingsV1(file: File) {
  if (!file) {
    throw new ValidationError('No file provided in the request body');
  }

  const zipBuffer = await file.arrayBuffer();
  const builtSettingsPath = await buildSettingsV1(zipBuffer);

  // Determine temp directory to clean up
  // builtSettingsPath is: /tmp/comapeo-settings-XXX/.../build/file.comapeocat
  // We want to remove: /tmp/comapeo-settings-XXX
  const pathParts = builtSettingsPath.split(path.sep);
  const tempDirIndex = pathParts.findIndex(part => part.startsWith('comapeo-settings-'));
  const tmpDir = tempDirIndex > 0 ? pathParts.slice(0, tempDirIndex + 1).join(path.sep) : null;

  // Create a streaming response that cleans up after the file is sent
  const bunFile = Bun.file(builtSettingsPath);
  const originalStream = bunFile.stream();

  // Wrap the stream to ensure cleanup happens after streaming completes
  const reader = originalStream.getReader();
  const cleanupStream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        // Clean up temp directory after streaming is complete
        if (tmpDir) {
          fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
        }
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      // Clean up if the stream is cancelled/aborted
      if (tmpDir) {
        fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      }
    }
  });

  return new Response(cleanupStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(builtSettingsPath)}"`,
      'Content-Length': bunFile.size.toString(),
    },
  });
}

/**
 * Handle v2 request using comapeocat Writer
 */
export async function handleBuildSettingsV2(payload: BuildRequestV2) {
  if (!payload) {
    throw new ValidationError('Request body is required');
  }

  try {
    console.log('[COMAPEO-API] Received request for /v2 build.');

    const result = await buildComapeoCatV2(payload);
    const tmpDir = path.dirname(result.outputPath);

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(`[COMAPEO-API][WARN] ${warning}`);
      }
    }

    console.log(`[COMAPEO-API] Generated .comapeocat file: ${result.outputPath}. Starting validation.`);

    try {
      const reader = new Reader(result.outputPath);
      const validationResult = await validateComapeocatWithTimeout(reader, result.outputPath);
      if (Array.isArray(validationResult) && validationResult.length > 0) {
        // Validation failed
        const errors = validationResult.map(e => `${e.message} at ${e.filePath || 'unknown file'}`).join('\n');
        console.error(`[COMAPEO-API] .comapeocat validation failed for ${result.outputPath}:\n${errors}`);
        // Clean up temp directory before throwing error
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
        throw new ValidationError(`Generated .comapeocat file is invalid:\n${errors}`);
      }
      console.log(`[COMAPEO-API] .comapeocat validation successful for ${result.outputPath}.`);
    } catch (validationError: any) { // Explicitly type validationError as 'any' for broader compatibility
      // Handle errors during validation itself (e.g., file not found, reader issues)
      console.error(`[COMAPEO-API] Error during .comapeocat validation for ${result.outputPath}:`, validationError);
      // Clean up temp directory before re-throwing error
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      throw new ProcessingError(`Failed to validate generated .comapeocat file: ${validationError.message}`);
    }

    // Create a streaming response that cleans up after the file is sent
    const bunFile = Bun.file(result.outputPath);
    const originalStream = bunFile.stream();

    console.log(`[COMAPEO-API] Sending .comapeocat file: ${result.fileName}`);

    // Wrap the stream to ensure cleanup happens after streaming completes
    const reader = originalStream.getReader();
    const cleanupStream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          // Clean up temp directory after streaming is complete
          fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
        } else {
          controller.enqueue(value);
        }
      },
      cancel() {
        // Clean up if the stream is cancelled/aborted
        fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      }
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(result.outputPath)}"`,
      'Content-Length': bunFile.size.toString(),
    };

    const warningsHeader = formatWarningsHeader(result.warnings);
    if (warningsHeader) {
      headers['X-Comapeo-Warnings'] = warningsHeader;
    }

    return new Response(cleanupStream, { headers });
  } catch (error) {
    await logV2PayloadForFailure(payload, error);
    throw error;
  }
}

async function validateComapeocatWithTimeout(reader: Reader, outputPath: string) {
  const timeoutMs = config.validationTimeoutMs;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new ProcessingError(`.comapeocat validation timed out after ${timeoutMs}ms for ${outputPath}`));
      }, timeoutMs);
    });

    return await Promise.race([reader.validate(), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function formatWarningsHeader(warnings: string[]) {
  if (!warnings || warnings.length === 0) {
    return undefined;
  }

  const sanitized = warnings
    .map((warning) => warning.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (sanitized.length === 0) {
    return undefined;
  }

  const joined = sanitized.join(' | ');
  // Limit header size to a reasonable length to avoid header bloat
  return joined.length > 1024 ? `${joined.slice(0, 1021)}...` : joined;
}

const PAYLOAD_LOG_PREFIX = 'comapeo-v2-payload-';
const SUMMARY_SAMPLE_LIMIT = 8;
const ISSUE_SAMPLE_LIMIT = 5;

async function logV2PayloadForFailure(payload: BuildRequestV2, error: unknown) {
  try {
    const summary = buildPayloadSummary(payload);
    const payloadPath = await persistPayloadSnapshot(payload);
    console.error(
      `[COMAPEO-API][ERROR] /v2 build failed. Summary: ${JSON.stringify(summary)}. Full payload saved to: ${payloadPath}`,
      error
    );
  } catch (serializationError) {
    console.error(
      '[COMAPEO-API][ERROR] /v2 build failed and payload logging also failed:',
      serializationError,
      error
    );
  }
}

function buildPayloadSummary(payload: BuildRequestV2) {
  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const icons = Array.isArray(payload.icons) ? payload.icons : [];
  const translationLocales = payload.translations && typeof payload.translations === 'object'
    ? Object.keys(payload.translations)
    : [];

  const categoryIds = categories.map((c) => c.id).filter(Boolean);
  const fieldIds = fields.map((f) => f.id).filter(Boolean);
  const localesSample = truncateList(translationLocales, SUMMARY_SAMPLE_LIMIT);
  const categoriesWithoutFields = categories
    .filter((category) => !Array.isArray(category.fields) && !Array.isArray(category.defaultFieldIds))
    .map((category) => category.id);

  const iconIds = new Set(icons.map((icon) => icon.id).filter(Boolean));
  const referencedIconIds = categories
    .map((category) => {
      const directIcon = (category as any).icon;
      if (typeof directIcon === 'string' && directIcon.trim()) {
        return directIcon.trim();
      }
      if (typeof category.iconId === 'string' && category.iconId.trim()) {
        return category.iconId.trim();
      }
      return undefined;
    })
    .filter((value): value is string => Boolean(value));

  const missingIconRefs = iconIds.size > 0
    ? Array.from(new Set(referencedIconIds.filter((ref) => !iconIds.has(ref))))
    : [];

  const potentialIssues: string[] = [];

  if (categoriesWithoutFields.length > 0) {
    potentialIssues.push(
      formatIssue(
        'Categories without field references',
        categoriesWithoutFields,
        ISSUE_SAMPLE_LIMIT
      )
    );
  }

  if (missingIconRefs.length > 0) {
    potentialIssues.push(
      formatIssue('Categories referencing missing icon ids', missingIconRefs, ISSUE_SAMPLE_LIMIT)
    );
  }

  const iconStats = summarizeIconStats(icons);

  return {
    metadata: {
      name: payload.metadata?.name || 'unknown',
      version: payload.metadata?.version || 'n/a',
    },
    counts: {
      categories: categories.length,
      fields: fields.length,
      icons: icons.length,
      translations: translationLocales.length,
    },
    samples: {
      categoryIds: truncateList(categoryIds, SUMMARY_SAMPLE_LIMIT),
      fieldIds: truncateList(fieldIds, SUMMARY_SAMPLE_LIMIT),
      locales: localesSample,
    },
    potentialIssues,
    iconStats,
  };
}

function summarizeIconStats(icons: IconInput[]) {
  if (!icons || icons.length === 0) {
    return undefined;
  }

  let inlineCount = 0;
  let dataUriCount = 0;
  let remoteCount = 0;
  let missingSourceCount = 0;
  let inlineBytesTotal = 0;
  let inlineBytesMax = 0;

  for (const icon of icons) {
    if (typeof icon.svgData === 'string') {
      inlineCount += 1;
      const size = Buffer.byteLength(icon.svgData, 'utf-8');
      inlineBytesTotal += size;
      inlineBytesMax = Math.max(inlineBytesMax, size);
    } else if (typeof icon.svgUrl === 'string') {
      if (icon.svgUrl.startsWith('data:image/svg+xml')) {
        dataUriCount += 1;
      } else {
        remoteCount += 1;
      }
    } else {
      missingSourceCount += 1;
    }
  }

  const inlineAvg = inlineCount > 0 ? Math.round(inlineBytesTotal / inlineCount) : 0;

  return {
    inlineCount,
    dataUriCount,
    remoteCount,
    missingSourceCount,
    inlineBytesTotal,
    inlineBytesMax,
    inlineBytesAvg: inlineAvg,
  };
}

function formatIssue(label: string, values: string[], limit: number) {
  const uniqueValues = Array.from(new Set(values));
  const sample = truncateList(uniqueValues, limit);
  const excess = uniqueValues.length - sample.length;
  return excess > 0 ? `${label}: ${sample.join(', ')} (+${excess} more)` : `${label}: ${sample.join(', ')}`;
}

function truncateList<T>(values: T[], limit: number): T[] {
  if (!Array.isArray(values) || values.length <= limit) {
    return values.slice();
  }
  return values.slice(0, limit);
}

async function persistPayloadSnapshot(payload: BuildRequestV2) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), PAYLOAD_LOG_PREFIX));
  const filePath = path.join(tempDir, `payload-${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return filePath;
}
