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

// Request size limits
const MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB for JSON
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB for ZIP

/**
 * Handle POST /build request
 * Supports both JSON mode and legacy ZIP mode
 */
export async function handleBuild(request: Request): Promise<Response> {
  // Check content-length header for size limits
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_ZIP_SIZE) {
      return createErrorResponse(
        'PayloadTooLarge',
        `Request body size ${size} bytes exceeds maximum ${MAX_ZIP_SIZE} bytes`,
        413
      );
    }
  }

  const contentType = request.headers.get('Content-Type') || '';

  // Detect mode based on Content-Type (more robust parsing)
  const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();
  const isJSONMode = normalizedContentType === 'application/json';
  const isZIPMode = normalizedContentType === 'multipart/form-data';

  try {
    if (isJSONMode) {
      // JSON mode
      return await handleJSONMode(request);
    } else if (isZIPMode) {
      // Legacy ZIP mode
      return await handleZIPMode(request);
    } else {
      // Unknown mode
      return createErrorResponse(
        'InvalidRequest',
        'Content-Type must be either application/json or multipart/form-data',
        400
      );
    }
  } catch (error) {
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
async function handleJSONMode(request: Request): Promise<Response> {
  logger.info('Processing JSON mode request', { mode: 'json' });

  const buildStartTime = Date.now();

  // Parse JSON body
  let buildRequest: BuildRequest;
  try {
    buildRequest = await request.json() as BuildRequest;
  } catch (error) {
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
    const buildResult = await buildFromJSON(buildRequest);
    cleanup = buildResult.cleanup;

    // Read the file and return it
    const file = Bun.file(buildResult.path);
    const blob = await file.arrayBuffer();

    const filename = `${buildRequest.metadata.name}-${buildRequest.metadata.version}.comapeocat`;

    const response = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

    // Clean up temporary files after response is created
    await cleanup();

    // Record successful build
    metrics.recordBuild(true, Date.now() - buildStartTime, false);

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
async function handleZIPMode(request: Request): Promise<Response> {
  logger.info('Processing legacy ZIP mode request', { mode: 'zip', deprecated: true });

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return createErrorResponse(
      'InvalidFormData',
      'Invalid multipart/form-data in request body',
      400
    );
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return createErrorResponse(
      'MissingFile',
      'No file provided in the request body',
      400
    );
  }

  // Build using the legacy method
  try {
    const zipBuffer = await file.arrayBuffer();
    const builtFilePath = await buildSettings(zipBuffer);

    // Read the file and return it
    const builtFile = Bun.file(builtFilePath);
    const blob = await builtFile.arrayBuffer();

    // Extract filename from path
    const filename = builtFilePath.split('/').pop() || 'config.comapeocat';

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
