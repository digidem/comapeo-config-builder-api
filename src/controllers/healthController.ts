/**
 * Health check controller
 * Provides detailed health status for monitoring and deployment
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    mapeoBuilder: HealthCheck;
    diskSpace: HealthCheck;
    tempDirectory: HealthCheck;
  };
  details?: {
    nodeVersion: string;
    platform: string;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
  };
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  details?: any;
}

/**
 * Check if mapeo-settings-builder CLI is available
 */
async function checkMapeoBuilder(): Promise<HealthCheck> {
  try {
    // Try to run mapeo-settings-builder --version
    const output = execSync('mapeo-settings-builder --version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return {
      status: 'pass',
      message: 'mapeo-settings-builder is available',
      details: {
        version: output.trim()
      }
    };
  } catch (error) {
    return {
      status: 'fail',
      message: 'mapeo-settings-builder not found or not executable',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Check available disk space in temp directory
 */
async function checkDiskSpace(): Promise<HealthCheck> {
  try {
    const tmpDir = os.tmpdir();

    // Get disk usage stats (platform-specific)
    let availableGB: number;

    if (process.platform === 'win32') {
      // Windows: Use wmic or powershell
      try {
        const drive = tmpDir.substring(0, 2); // e.g., "C:"
        const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace`, {
          encoding: 'utf-8',
          timeout: 5000
        });
        const lines = output.trim().split('\n').filter(line => line.trim());
        const freeBytes = parseInt(lines[lines.length - 1].trim(), 10);
        availableGB = freeBytes / (1024 * 1024 * 1024);
      } catch (error) {
        return {
          status: 'warn',
          message: 'Could not check disk space on Windows',
          details: { platform: 'win32' }
        };
      }
    } else {
      // Unix-like: Use df command
      try {
        const output = execSync(`df -k "${tmpDir}" | tail -1 | awk '{print $4}'`, {
          encoding: 'utf-8',
          timeout: 5000
        });
        const availableKB = parseInt(output.trim(), 10);
        availableGB = availableKB / (1024 * 1024);
      } catch (error) {
        return {
          status: 'warn',
          message: 'Could not check disk space',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
      }
    }

    // Warn if less than 1GB available, fail if less than 100MB
    if (availableGB < 0.1) {
      return {
        status: 'fail',
        message: 'Critically low disk space',
        details: { availableGB: availableGB.toFixed(2) }
      };
    } else if (availableGB < 1) {
      return {
        status: 'warn',
        message: 'Low disk space',
        details: { availableGB: availableGB.toFixed(2) }
      };
    } else {
      return {
        status: 'pass',
        message: 'Sufficient disk space available',
        details: { availableGB: availableGB.toFixed(2) }
      };
    }
  } catch (error) {
    return {
      status: 'warn',
      message: 'Could not check disk space',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Check temp directory is writable
 */
async function checkTempDirectory(): Promise<HealthCheck> {
  try {
    const tmpDir = os.tmpdir();

    // Try to create a test file
    const testFile = path.join(tmpDir, `health-check-${Date.now()}.tmp`);

    try {
      await fs.writeFile(testFile, 'health check test', 'utf-8');
      await fs.unlink(testFile);

      return {
        status: 'pass',
        message: 'Temp directory is writable',
        details: { tmpDir }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Temp directory is not writable',
        details: {
          tmpDir,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: 'Could not access temp directory',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Get overall health status
 */
export async function getHealthStatus(includeDetails: boolean = false): Promise<HealthStatus> {
  const startTime = Date.now();

  // Run all health checks in parallel
  const [mapeoBuilder, diskSpace, tempDirectory] = await Promise.all([
    checkMapeoBuilder(),
    checkDiskSpace(),
    checkTempDirectory()
  ]);

  const checks = {
    mapeoBuilder,
    diskSpace,
    tempDirectory
  };

  // Determine overall status
  const hasFailures = Object.values(checks).some(check => check.status === 'fail');
  const hasWarnings = Object.values(checks).some(check => check.status === 'warn');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (hasFailures) {
    status = 'unhealthy';
  } else if (hasWarnings) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const healthStatus: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks
  };

  // Add detailed system info if requested
  if (includeDetails) {
    const memUsage = process.memoryUsage();
    healthStatus.details = {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024) // MB
      }
    };
  }

  return healthStatus;
}

/**
 * Simple health check handler (just status)
 */
export async function handleHealthCheck(): Promise<Response> {
  const health = await getHealthStatus(false);

  // Return appropriate HTTP status code
  const httpStatus = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return new Response(JSON.stringify(health), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

/**
 * Detailed health check handler (with system info)
 */
export async function handleDetailedHealthCheck(): Promise<Response> {
  const health = await getHealthStatus(true);

  // Return appropriate HTTP status code
  const httpStatus = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return new Response(JSON.stringify(health), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
