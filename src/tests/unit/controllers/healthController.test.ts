import { describe, it, expect } from 'bun:test';
import { getHealthStatus, handleHealthCheck, handleDetailedHealthCheck } from '../../../controllers/healthController';

describe('Health Controller', () => {
  describe('getHealthStatus', () => {
    it('should return health status object', async () => {
      const health = await getHealthStatus(false);

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.checks).toBeDefined();
    });

    it('should include all required checks', async () => {
      const health = await getHealthStatus(false);

      expect(health.checks.mapeoBuilder).toBeDefined();
      expect(health.checks.diskSpace).toBeDefined();
      expect(health.checks.tempDirectory).toBeDefined();

      // Each check should have a status
      expect(['pass', 'warn', 'fail']).toContain(health.checks.mapeoBuilder.status);
      expect(['pass', 'warn', 'fail']).toContain(health.checks.diskSpace.status);
      expect(['pass', 'warn', 'fail']).toContain(health.checks.tempDirectory.status);
    });

    it('should include detailed info when requested', async () => {
      const health = await getHealthStatus(true);

      expect(health.details).toBeDefined();
      expect(health.details?.nodeVersion).toBeDefined();
      expect(health.details?.platform).toBeDefined();
      expect(health.details?.memoryUsage).toBeDefined();
      expect(health.details?.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(health.details?.memoryUsage.heapTotal).toBeGreaterThan(0);
    });

    it('should not include detailed info when not requested', async () => {
      const health = await getHealthStatus(false);

      expect(health.details).toBeUndefined();
    });

    it('should return degraded status if any check has warn status', async () => {
      const health = await getHealthStatus(false);

      const hasWarnings = Object.values(health.checks).some(check => check.status === 'warn');
      const hasFailures = Object.values(health.checks).some(check => check.status === 'fail');

      if (hasFailures) {
        expect(health.status).toBe('unhealthy');
      } else if (hasWarnings) {
        expect(health.status).toBe('degraded');
      } else {
        expect(health.status).toBe('healthy');
      }
    });

    it('should have messages for failed checks', async () => {
      const health = await getHealthStatus(false);

      Object.values(health.checks).forEach(check => {
        if (check.status === 'fail' || check.status === 'warn') {
          expect(check.message).toBeDefined();
          expect(check.message).toBeTruthy();
        }
      });
    });
  });

  describe('handleHealthCheck', () => {
    it('should return Response object', async () => {
      const response = await handleHealthCheck();

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toContain('no-cache');
    });

    it('should return 200 for healthy or degraded status', async () => {
      const response = await handleHealthCheck();
      const body = await response.json();

      if (body.status === 'healthy' || body.status === 'degraded') {
        expect(response.status).toBe(200);
      } else if (body.status === 'unhealthy') {
        expect(response.status).toBe(503);
      }
    });

    it('should return valid JSON', async () => {
      const response = await handleHealthCheck();
      const body = await response.json();

      expect(body).toBeDefined();
      expect(body.status).toBeDefined();
      expect(body.checks).toBeDefined();
    });
  });

  describe('handleDetailedHealthCheck', () => {
    it('should return Response object with details', async () => {
      const response = await handleDetailedHealthCheck();

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should include system details', async () => {
      const response = await handleDetailedHealthCheck();
      const body = await response.json();

      expect(body.details).toBeDefined();
      expect(body.details.nodeVersion).toBeDefined();
      expect(body.details.platform).toBeDefined();
      expect(body.details.memoryUsage).toBeDefined();
    });
  });

  describe('Individual Health Checks', () => {
    it('should check temp directory is writable', async () => {
      const health = await getHealthStatus(false);
      const tempCheck = health.checks.tempDirectory;

      expect(tempCheck).toBeDefined();
      expect(tempCheck.status).toBeDefined();

      // Should pass in most environments
      if (tempCheck.status === 'pass') {
        expect(tempCheck.message).toContain('writable');
      }
    });

    it('should check disk space', async () => {
      const health = await getHealthStatus(false);
      const diskCheck = health.checks.diskSpace;

      expect(diskCheck).toBeDefined();
      expect(diskCheck.status).toBeDefined();

      // Should have details about available space (if check succeeded)
      if (diskCheck.status === 'pass' || diskCheck.status === 'warn') {
        expect(diskCheck.details).toBeDefined();
      }
    });

    it('should check mapeo-settings-builder availability', async () => {
      const health = await getHealthStatus(false);
      const mapeoCheck = health.checks.mapeoBuilder;

      expect(mapeoCheck).toBeDefined();
      expect(mapeoCheck.status).toBeDefined();

      // If it passes, should have version info
      if (mapeoCheck.status === 'pass') {
        expect(mapeoCheck.details).toBeDefined();
        expect(mapeoCheck.details.version).toBeDefined();
      } else {
        // If it fails, should explain why
        expect(mapeoCheck.message).toBeDefined();
      }
    });
  });

  describe('HTTP Status Codes', () => {
    it('should return 503 for unhealthy status', async () => {
      const health = await getHealthStatus(false);

      if (health.status === 'unhealthy') {
        const response = await handleHealthCheck();
        expect(response.status).toBe(503);
      }
    });

    it('should return 200 for degraded status', async () => {
      const health = await getHealthStatus(false);

      if (health.status === 'degraded') {
        const response = await handleHealthCheck();
        expect(response.status).toBe(200);
      }
    });

    it('should return 200 for healthy status', async () => {
      const health = await getHealthStatus(false);

      if (health.status === 'healthy') {
        const response = await handleHealthCheck();
        expect(response.status).toBe(200);
      }
    });
  });
});
