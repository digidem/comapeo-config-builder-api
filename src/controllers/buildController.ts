/**
 * Controller for the /build endpoint (v2.0.0)
 * Handles both JSON mode and legacy ZIP mode
 */

import type { BuildRequest, ErrorResponse } from '../types/schema';
import { validateBuildRequest } from '../validators/schema';
import { buildFromJSON } from '../services/jsonBuilder';
import { buildSettings } from '../services/settingsBuilder';
import { logger } from '../utils/logger';
import { metrics } from './metricsController';
import type { RequestContext } from '../middleware/timeout';

import path from 'path';

// Request size limits
const MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB for JSON
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB for ZIP

/**
 * Sanitize a string for use in Content-Disposition filename
 * Prevents header injection and produces valid filenames
 */
function sanitizeFilename(input: string): string {
  // Strip directory components
  let sanitized = path.basename(input);

  // Remove CRLF and other control characters (header injection prevention)
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove/escape quotes and backslashes
  sanitized = sanitized.replace(/["\\\x00-\x1f]/g, '_');

  // Allow only safe characters for filenames
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_\.]/g, '_');

  // Remove leading dots
  sanitized = sanitized.replace(/^\.+/, '');

  // Ensure non-empty
  if (!sanitized) {
    sanitized = 'config';
  }

  return sanitized;
}

/**
 * Read request body with size limit enforcement
 * Prevents unbounded memory usage from chunked/unlimited requests
 * @param request The HTTP request
 * @param maxSize Maximum allowed body size in bytes
 * @param signal Optional abort signal to cancel reading on timeout
 */
async function readLimitedBody(request: Request, maxSize: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Request aborted');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error('No request body');
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      // Check for abort signal during reading
      if (signal?.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        const error = new Error(`Request body size exceeds maximum ${maxSize} bytes`);
        error.name = 'PayloadTooLarge';
        throw error;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Combine chunks into single ArrayBuffer
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined.buffer as ArrayBuffer;
}

/**
 * Handle POST /build request
 * Supports both JSON mode and legacy ZIP mode
 * @param request The HTTP request
 * @param context Optional request context with abort signal for timeout handling
 */
export async function handleBuild(request: Request, context?: RequestContext): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || '';

  // Detect mode based on Content-Type (more robust parsing)
  const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();
  const isJSONMode = normalizedContentType === 'application/json';
  const isZIPMode = normalizedContentType === 'multipart/form-data';

  // Apply appropriate size limit based on content type
  const maxSize = isJSONMode ? MAX_JSON_SIZE : MAX_ZIP_SIZE;

  // Early rejection if Content-Length header indicates oversized body
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      return createErrorResponse(
        'PayloadTooLarge',
        `Request body size ${size} bytes exceeds maximum ${maxSize} bytes`,
        413
      );
    }
  }

  try {
    if (isJSONMode) {
      // JSON mode - read body with size limit then parse
      return await handleJSONMode(request, maxSize, context?.signal);
    } else if (isZIPMode) {
      // Legacy ZIP mode - read body with size limit then parse
      return await handleZIPMode(request, maxSize, context?.signal);
    } else {
      // Unknown mode
      return createErrorResponse(
        'InvalidRequest',
        'Content-Type must be either application/json or multipart/form-data',
        400
      );
    }
  } catch (error) {
    // Handle size limit errors
    if (error instanceof Error && error.name === 'PayloadTooLarge') {
      return createErrorResponse(
        'PayloadTooLarge',
        error.message,
        413
      );
    }

    logger.error('Error in handleBuild', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Handle validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return createErrorResponse(
        'ValidationError',
        error.message,
        400
      );
    }

    // Handle other errors
    return createErrorResponse(
      'InternalError',
      `Error processing request: ${(error as Error).message}`,
      500
    );
  }
}

/**
 * Handle JSON mode request
 */
async function handleJSONMode(request: Request, maxSize: number, signal?: AbortSignal): Promise<Response> {
  logger.info('Processing JSON mode request', { mode: 'json' });

  const buildStartTime = Date.now();

  // Read body with size limit enforcement, then parse JSON
  let buildRequest: BuildRequest;
  try {
    const bodyBuffer = await readLimitedBody(request, maxSize, signal);
    const bodyText = new TextDecoder().decode(bodyBuffer);
    buildRequest = JSON.parse(bodyText) as BuildRequest;
  } catch (error) {
    // Re-throw size limit errors to be handled by caller
    if (error instanceof Error && error.name === 'PayloadTooLarge') {
      throw error;
    }
    return createErrorResponse(
      'InvalidJSON',
      'Invalid JSON in request body',
      400
    );
  }

  // Validate the request
  const validationResult = validateBuildRequest(buildRequest);
  if (!validationResult.valid) {
    const errorMessage = validationResult.errors.join('; ');
    // Record validation error in metrics
    metrics.recordBuild(false, Date.now() - buildStartTime, true);
    return createErrorResponse(
      'ValidationError',
      errorMessage,
      400,
      { errors: validationResult.errors }
    );
  }

  // Build the .comapeocat file
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const buildResult = await buildFromJSON(buildRequest, { signal });
    cleanup = buildResult.cleanup;

    // Read the file and return it
    const file = Bun.file(buildResult.path);
    const blob = await file.arrayBuffer();

    // Sanitize filename components to prevent header injection
    const safeName = sanitizeFilename(buildRequest.metadata.name);
    const safeVersion = sanitizeFilename(buildRequest.metadata.version);
    const filename = `${safeName}-${safeVersion}.comapeocat`;

    const response = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

    // Record successful build before cleanup (build succeeded regardless of cleanup outcome)
    metrics.recordBuild(true, Date.now() - buildStartTime, false);

    // Best-effort cleanup - don't let cleanup errors affect the successful response
    try {
      await cleanup();
    } catch (cleanupError) {
      logger.warn('Cleanup failed after successful build', {
        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
      });
    }

    return response;

  } catch (error) {
    logger.error('Error building from JSON', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Clean up on error if cleanup function exists
    if (cleanup) {
      await cleanup();
    }

    // Record failed build
    metrics.recordBuild(false, Date.now() - buildStartTime, false);

    return createErrorResponse(
      'BuildError',
      `Error building configuration: ${(error as Error).message}`,
      500
    );
  }
}

/**
 * Handle legacy ZIP mode request
 */
async function handleZIPMode(request: Request, maxSize: number, signal?: AbortSignal): Promise<Response> {
  logger.info('Processing legacy ZIP mode request', { mode: 'zip', deprecated: true });

  const buildStartTime = Date.now();

  // Read body with size limit BEFORE parsing multipart
  // This prevents OOM from unbounded chunked uploads
  let bodyBuffer: ArrayBuffer;
  try {
    bodyBuffer = await readLimitedBody(request, maxSize, signal);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'PayloadTooLarge') {
        return createErrorResponse(
          'PayloadTooLarge',
          error.message,
          413
        );
      }
      // Map body reading errors to 400 client errors
      if (error.message === 'No request body' || error.message === 'Request aborted') {
        return createErrorResponse(
          'InvalidRequest',
          error.message,
          400
        );
      }
    }
    throw error;
  }

  // Create new Request with the limited body for formData parsing
  const limitedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyBuffer
  });

  // Parse multipart form data from the size-limited body
  let formData: FormData;
  try {
    formData = await limitedRequest.formData();
  } catch (error) {
    return createErrorResponse(
      'InvalidFormData',
      'Invalid multipart/form-data in request body',
      400
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return createErrorResponse(
      'InvalidFile',
      'Field "file" must be a file upload, not a text value',
      400
    );
  }

  // Build using the legacy method
  try {
    const zipBuffer = await file.arrayBuffer();
    const builtFilePath = await buildSettings(zipBuffer, { signal });

    // Read the file and return it
    const builtFile = Bun.file(builtFilePath);
    const blob = await builtFile.arrayBuffer();

    // Extract filename from path
    const filename = builtFilePath.split('/').pop() || 'config.comapeocat';

    // Record successful build
    metrics.recordBuild(true, Date.now() - buildStartTime, false);

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Deprecation-Warning': 'ZIP mode is deprecated; please migrate to JSON mode.'
      }
    });

  } catch (error) {
    logger.error('Error building from ZIP', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      mode: 'zip',
      deprecated: true
    });

    // Record failed build
    metrics.recordBuild(false, Date.now() - buildStartTime, false);

    return new Response(
      JSON.stringify({
        error: 'BuildError',
        message: `Error processing ZIP file: ${(error as Error).message}`
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Deprecation-Warning': 'ZIP mode is deprecated; please migrate to JSON mode.'
        }
      }
    );
  }
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  error: string,
  message: string,
  status: number,
  details?: Record<string, any>
): Response {
  const errorBody: ErrorResponse = {
    error,
    message,
    ...(details && { details })
  };

  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
