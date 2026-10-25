/**
 * Prometheus / OpenMetrics Exporter
 * Tracks RED (Rate, Errors, Duration) metrics for APM platforms (Prometheus, Datadog, Grafana).
 */
class MetricsRegistry {
    constructor() {
        this.httpRequests = new Map(); // key: "METHOD:ROUTE:STATUS" -> count
        this.httpDurationSum = new Map(); // key: "METHOD:ROUTE" -> sumMs
        this.httpDurationCount = new Map(); // key: "METHOD:ROUTE" -> count
        this.upstreamRequests = new Map(); // key: "ENDPOINT:STATUS" -> count
        this.upstreamDurationSum = new Map(); // key: "ENDPOINT" -> sumMs
        this.upstreamDurationCount = new Map(); // key: "ENDPOINT" -> count
        this.startTime = Date.now();
    }

    recordHttpRequest(method, route, statusCode, durationMs) {
        const routeKey = route || 'unknown';
        const metricKey = `${method}:${routeKey}:${statusCode}`;
        this.httpRequests.set(metricKey, (this.httpRequests.get(metricKey) || 0) + 1);

        const durationKey = `${method}:${routeKey}`;
        this.httpDurationSum.set(durationKey, (this.httpDurationSum.get(durationKey) || 0) + durationMs);
        this.httpDurationCount.set(durationKey, (this.httpDurationCount.get(durationKey) || 0) + 1);
    }

    recordUpstreamRequest(endpoint, statusCode, durationMs) {
        const metricKey = `${endpoint}:${statusCode}`;
        this.upstreamRequests.set(metricKey, (this.upstreamRequests.get(metricKey) || 0) + 1);

        this.upstreamDurationSum.set(endpoint, (this.upstreamDurationSum.get(endpoint) || 0) + durationMs);
        this.upstreamDurationCount.set(endpoint, (this.upstreamDurationCount.get(endpoint) || 0) + 1);
    }

    toPrometheusFormat(cacheStats = {}) {
        const lines = [];
        const mem = process.memoryUsage();
        const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

        lines.push('# HELP process_uptime_seconds The process uptime in seconds.');
        lines.push('# TYPE process_uptime_seconds gauge');
        lines.push(`process_uptime_seconds ${uptimeSec}`);

        lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes.');
        lines.push('# TYPE process_resident_memory_bytes gauge');
        lines.push(`process_resident_memory_bytes ${mem.rss}`);

        lines.push('# HELP process_heap_used_bytes Process heap memory used in bytes.');
        lines.push('# TYPE process_heap_used_bytes gauge');
        lines.push(`process_heap_used_bytes ${mem.heapUsed}`);

        lines.push('# HELP http_requests_total Total number of HTTP requests handled.');
        lines.push('# TYPE http_requests_total counter');
        for (const [key, count] of this.httpRequests.entries()) {
            const [method, route, status] = key.split(':');
            lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
        }

        lines.push('# HELP http_request_duration_ms_avg Average request processing duration in milliseconds.');
        lines.push('# TYPE http_request_duration_ms_avg gauge');
        for (const [key, sum] of this.httpDurationSum.entries()) {
            const count = this.httpDurationCount.get(key) || 1;
            const [method, route] = key.split(':');
            const avg = (sum / count).toFixed(2);
            lines.push(`http_request_duration_ms_avg{method="${method}",route="${route}"} ${avg}`);
        }

        lines.push('# HELP upstream_requests_total Total requests executed against Urja Ops legacy portal.');
        lines.push('# TYPE upstream_requests_total counter');
        for (const [key, count] of this.upstreamRequests.entries()) {
            const [endpoint, status] = key.split(':');
            lines.push(`upstream_requests_total{endpoint="${endpoint}",status="${status}"} ${count}`);
        }

        lines.push('# HELP upstream_latency_ms_avg Average latency communicating with upstream portal.');
        lines.push('# TYPE upstream_latency_ms_avg gauge');
        for (const [endpoint, sum] of this.upstreamDurationSum.entries()) {
            const count = this.upstreamDurationCount.get(endpoint) || 1;
            const avg = (sum / count).toFixed(2);
            lines.push(`upstream_latency_ms_avg{endpoint="${endpoint}"} ${avg}`);
        }

        if (cacheStats) {
            lines.push('# HELP cache_hits_total In-memory SWR cache hits.');
            lines.push('# TYPE cache_hits_total counter');
            lines.push(`cache_hits_total ${cacheStats.hits || 0}`);

            lines.push('# HELP cache_misses_total In-memory SWR cache misses.');
            lines.push('# TYPE cache_misses_total counter');
            lines.push(`cache_misses_total ${cacheStats.misses || 0}`);
        }

        return lines.join('\n') + '\n';
    }
}

const metrics = new MetricsRegistry();
module.exports = metrics;
