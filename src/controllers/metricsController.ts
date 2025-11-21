/**
 * Metrics controller - Prometheus-format metrics endpoint
 * Provides operational metrics for monitoring and alerting
 */

export class MetricsCollector {
  private requestCount: Map<string, Map<number, number>> = new Map(); // endpoint -> status -> count
  private requestDurations: Map<string, number[]> = new Map(); // endpoint -> durations[]
  private buildMetrics = {
    total: 0,
    success: 0,
    failure: 0,
    validationErrors: 0,
    durations: [] as number[]
  };
  private rateLimitHits = 0;
  private activeRequests = 0;
  private startTime = Date.now();

  /**
   * Record an HTTP request
   */
  recordRequest(endpoint: string, statusCode: number, durationMs: number): void {
    // Increment request count
    if (!this.requestCount.has(endpoint)) {
      this.requestCount.set(endpoint, new Map());
    }
    const statusMap = this.requestCount.get(endpoint)!;
    statusMap.set(statusCode, (statusMap.get(statusCode) || 0) + 1);

    // Record duration
    if (!this.requestDurations.has(endpoint)) {
      this.requestDurations.set(endpoint, []);
    }
    const durations = this.requestDurations.get(endpoint)!;
    durations.push(durationMs);

    // Keep only last 1000 durations per endpoint to prevent memory growth
    if (durations.length > 1000) {
      durations.shift();
    }
  }

  /**
   * Record a build operation
   */
  recordBuild(success: boolean, durationMs: number, validationError: boolean = false): void {
    this.buildMetrics.total++;
    if (success) {
      this.buildMetrics.success++;
    } else {
      this.buildMetrics.failure++;
      if (validationError) {
        this.buildMetrics.validationErrors++;
      }
    }

    this.buildMetrics.durations.push(durationMs);

    // Keep only last 1000 durations to prevent memory growth
    if (this.buildMetrics.durations.length > 1000) {
      this.buildMetrics.durations.shift();
    }
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimitHit(): void {
    this.rateLimitHits++;
  }

  /**
   * Increment active requests counter
   */
  incrementActiveRequests(): void {
    this.activeRequests++;
  }

  /**
   * Decrement active requests counter
   */
  decrementActiveRequests(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Get Prometheus-format metrics
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Application uptime
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    lines.push('# HELP app_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE app_uptime_seconds counter');
    lines.push(`app_uptime_seconds ${uptimeSeconds}`);
    lines.push('');

    // Active requests
    lines.push('# HELP http_requests_active Number of currently active requests');
    lines.push('# TYPE http_requests_active gauge');
    lines.push(`http_requests_active ${this.activeRequests}`);
    lines.push('');

    // Request counts by endpoint and status
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [endpoint, statusMap] of this.requestCount.entries()) {
      for (const [status, count] of statusMap.entries()) {
        lines.push(`http_requests_total{endpoint="${endpoint}",status="${status}"} ${count}`);
      }
    }
    lines.push('');

    // Request duration histograms
    lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE http_request_duration_ms summary');
    for (const [endpoint, durations] of this.requestDurations.entries()) {
      if (durations.length > 0) {
        const sorted = [...durations].sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        const count = durations.length;

        lines.push(`http_request_duration_ms{endpoint="${endpoint}",quantile="0.5"} ${this.percentile(sorted, 50)}`);
        lines.push(`http_request_duration_ms{endpoint="${endpoint}",quantile="0.9"} ${this.percentile(sorted, 90)}`);
        lines.push(`http_request_duration_ms{endpoint="${endpoint}",quantile="0.95"} ${this.percentile(sorted, 95)}`);
        lines.push(`http_request_duration_ms{endpoint="${endpoint}",quantile="0.99"} ${this.percentile(sorted, 99)}`);
        lines.push(`http_request_duration_ms_sum{endpoint="${endpoint}"} ${sum}`);
        lines.push(`http_request_duration_ms_count{endpoint="${endpoint}"} ${count}`);
      }
    }
    lines.push('');

    // Build metrics
    lines.push('# HELP build_operations_total Total number of build operations');
    lines.push('# TYPE build_operations_total counter');
    lines.push(`build_operations_total{result="success"} ${this.buildMetrics.success}`);
    lines.push(`build_operations_total{result="failure"} ${this.buildMetrics.failure}`);
    lines.push(`build_operations_total{result="validation_error"} ${this.buildMetrics.validationErrors}`);
    lines.push('');

    // Build duration
    if (this.buildMetrics.durations.length > 0) {
      const sorted = [...this.buildMetrics.durations].sort((a, b) => a - b);
      const sum = this.buildMetrics.durations.reduce((a, b) => a + b, 0);
      const count = this.buildMetrics.durations.length;

      lines.push('# HELP build_duration_ms Build operation duration in milliseconds');
      lines.push('# TYPE build_duration_ms summary');
      lines.push(`build_duration_ms{quantile="0.5"} ${this.percentile(sorted, 50)}`);
      lines.push(`build_duration_ms{quantile="0.9"} ${this.percentile(sorted, 90)}`);
      lines.push(`build_duration_ms{quantile="0.95"} ${this.percentile(sorted, 95)}`);
      lines.push(`build_duration_ms{quantile="0.99"} ${this.percentile(sorted, 99)}`);
      lines.push(`build_duration_ms_sum ${sum}`);
      lines.push(`build_duration_ms_count ${count}`);
      lines.push('');
    }

    // Rate limiting
    lines.push('# HELP rate_limit_hits_total Total number of rate limit hits');
    lines.push('# TYPE rate_limit_hits_total counter');
    lines.push(`rate_limit_hits_total ${this.rateLimitHits}`);
    lines.push('');

    // Memory usage
    const memUsage = process.memoryUsage();
    lines.push('# HELP process_memory_bytes Process memory usage in bytes');
    lines.push('# TYPE process_memory_bytes gauge');
    lines.push(`process_memory_bytes{type="heap_used"} ${memUsage.heapUsed}`);
    lines.push(`process_memory_bytes{type="heap_total"} ${memUsage.heapTotal}`);
    lines.push(`process_memory_bytes{type="external"} ${memUsage.external}`);
    lines.push(`process_memory_bytes{type="rss"} ${memUsage.rss}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.requestCount.clear();
    this.requestDurations.clear();
    this.buildMetrics = {
      total: 0,
      success: 0,
      failure: 0,
      validationErrors: 0,
      durations: []
    };
    this.rateLimitHits = 0;
    this.activeRequests = 0;
    this.startTime = Date.now();
  }
}

// Global metrics collector instance
export const metrics = new MetricsCollector();

/**
 * Handle metrics endpoint request
 */
export function handleMetrics(): Response {
  const metricsText = metrics.getPrometheusMetrics();

  return new Response(metricsText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
