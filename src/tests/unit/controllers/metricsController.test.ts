import { describe, it, expect, beforeEach } from 'bun:test';
import { MetricsCollector, handleMetrics } from '../../../controllers/metricsController';

describe('Metrics Controller', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('MetricsCollector', () => {
    describe('recordRequest', () => {
      it('should record HTTP requests', () => {
        collector.recordRequest('/test', 200, 100);
        collector.recordRequest('/test', 200, 150);
        collector.recordRequest('/test', 404, 50);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('http_requests_total{endpoint="/test",status="200"} 2');
        expect(metrics).toContain('http_requests_total{endpoint="/test",status="404"} 1');
      });

      it('should record request durations', () => {
        collector.recordRequest('/api', 200, 100);
        collector.recordRequest('/api', 200, 200);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('http_request_duration_ms');
        expect(metrics).toContain('endpoint="/api"');
      });

      it('should track different endpoints separately', () => {
        collector.recordRequest('/build', 200, 1000);
        collector.recordRequest('/health', 200, 10);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('endpoint="/build"');
        expect(metrics).toContain('endpoint="/health"');
      });

      it('should limit duration history to prevent memory growth', () => {
        // Record 1500 durations (more than the 1000 limit)
        for (let i = 0; i < 1500; i++) {
          collector.recordRequest('/test', 200, 100);
        }

        const metrics = collector.getPrometheusMetrics();
        // Should still work without memory issues
        expect(metrics).toContain('http_requests_total');
      });
    });

    describe('recordBuild', () => {
      it('should record successful builds', () => {
        collector.recordBuild(true, 1000, false);
        collector.recordBuild(true, 1500, false);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('build_operations_total{result="success"} 2');
      });

      it('should record failed builds', () => {
        collector.recordBuild(false, 2000, false);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('build_operations_total{result="failure"} 1');
      });

      it('should record validation errors separately', () => {
        collector.recordBuild(false, 100, true);
        collector.recordBuild(false, 200, true);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('build_operations_total{result="validation_error"} 2');
      });

      it('should record build durations', () => {
        collector.recordBuild(true, 1000, false);
        collector.recordBuild(true, 2000, false);

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('build_duration_ms');
        expect(metrics).toContain('quantile');
      });

      it('should limit duration history', () => {
        // Record 1500 builds (more than the 1000 limit)
        for (let i = 0; i < 1500; i++) {
          collector.recordBuild(true, 1000, false);
        }

        const metrics = collector.getPrometheusMetrics();
        expect(metrics).toContain('build_operations_total');
      });
    });

    describe('recordRateLimitHit', () => {
      it('should record rate limit hits', () => {
        collector.recordRateLimitHit();
        collector.recordRateLimitHit();
        collector.recordRateLimitHit();

        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('rate_limit_hits_total 3');
      });
    });

    describe('active requests tracking', () => {
      it('should track active requests', () => {
        collector.incrementActiveRequests();
        collector.incrementActiveRequests();

        const metrics = collector.getPrometheusMetrics();
        expect(metrics).toContain('http_requests_active 2');

        collector.decrementActiveRequests();

        const metrics2 = collector.getPrometheusMetrics();
        expect(metrics2).toContain('http_requests_active 1');
      });

      it('should not go below zero', () => {
        collector.decrementActiveRequests();
        collector.decrementActiveRequests();

        const metrics = collector.getPrometheusMetrics();
        expect(metrics).toContain('http_requests_active 0');
      });
    });

    describe('getPrometheusMetrics', () => {
      it('should return Prometheus-format metrics', () => {
        collector.recordRequest('/test', 200, 100);

        const metrics = collector.getPrometheusMetrics();

        // Check for Prometheus format
        expect(metrics).toContain('# HELP');
        expect(metrics).toContain('# TYPE');
        expect(metrics).toContain('http_requests_total');
      });

      it('should include uptime metric', () => {
        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('# HELP app_uptime_seconds');
        expect(metrics).toContain('# TYPE app_uptime_seconds counter');
        expect(metrics).toContain('app_uptime_seconds');
      });

      it('should include memory metrics', () => {
        const metrics = collector.getPrometheusMetrics();

        expect(metrics).toContain('# HELP process_memory_bytes');
        expect(metrics).toContain('process_memory_bytes{type="heap_used"}');
        expect(metrics).toContain('process_memory_bytes{type="heap_total"}');
        expect(metrics).toContain('process_memory_bytes{type="rss"}');
      });

      it('should calculate percentiles correctly', () => {
        // Add requests with known durations
        for (let i = 1; i <= 100; i++) {
          collector.recordRequest('/test', 200, i);
        }

        const metrics = collector.getPrometheusMetrics();

        // Should have quantile metrics
        expect(metrics).toContain('quantile="0.5"');
        expect(metrics).toContain('quantile="0.9"');
        expect(metrics).toContain('quantile="0.95"');
        expect(metrics).toContain('quantile="0.99"');
      });

      it('should include summary statistics', () => {
        collector.recordRequest('/api', 200, 100);
        collector.recordRequest('/api', 200, 200);

        const metrics = collector.getPrometheusMetrics();

        // Should have _sum and _count
        expect(metrics).toContain('_sum');
        expect(metrics).toContain('_count');
      });
    });

    describe('reset', () => {
      it('should reset all metrics', () => {
        collector.recordRequest('/test', 200, 100);
        collector.recordBuild(true, 1000, false);
        collector.recordRateLimitHit();

        collector.reset();

        const metrics = collector.getPrometheusMetrics();

        // Should not contain previous requests
        expect(metrics).not.toContain('http_requests_total{endpoint="/test"');
        expect(metrics).not.toContain('build_operations_total{result="success"} 1');
        expect(metrics).not.toContain('rate_limit_hits_total 1');
      });
    });
  });

  describe('handleMetrics', () => {
    it('should return Response object', () => {
      const response = handleMetrics();

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it('should return text/plain content type', () => {
      const response = handleMetrics();

      const contentType = response.headers.get('Content-Type');
      expect(contentType).toContain('text/plain');
      expect(contentType).toContain('version=0.0.4');
    });

    it('should have no-cache headers', () => {
      const response = handleMetrics();

      expect(response.headers.get('Cache-Control')).toContain('no-cache');
    });

    it('should return Prometheus format metrics', async () => {
      const response = handleMetrics();
      const body = await response.text();

      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });
  });
});
