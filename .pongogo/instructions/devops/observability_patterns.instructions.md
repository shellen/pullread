---
pongogo_instruction_spec: "0.0.2"
title: "Observability Patterns"
description: "Observability patterns for monitoring, diagnostics, and system health tracking."
applies_to:
  - "**/*"
domains:
  - "devops"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - observability
      - monitoring
      - prometheus
      - metrics
      - /metrics
      - logging
      - structured_logging
      - winston
      - tracing
      - distributed_tracing
      - opentelemetry
      - jaeger
      - correlation_ID
      - X-Correlation-ID
      - grafana
      - dashboard
      - alerting
      - alert_rule
      - RED_metrics
      - rate_errors_duration
      - log_aggregation
      - loki
      - span
    nlp: "Observability patterns including Prometheus metrics, structured logging, distributed tracing, correlation IDs, and Grafana dashboards"
evaluation:
  success_signals:
    - All services expose /metrics endpoint
    - Correlation IDs propagated via X-Correlation-ID header
    - Logs in structured JSON format with correlation_id
    - RED metrics implemented (rate, errors, duration)
    - Alerts configured for high error rate and latency
  failure_signals:
    - Missing correlation IDs (can't trace cross-service)
    - Unstructured logs (console.log, not JSON)
    - "No sampling for traces (100% = performance overhead)"
    - Alert fatigue (alerting on internals, not symptoms)
    - No log retention policy
---


# Observability Patterns for Microservices

**Purpose**: Establish comprehensive observability for microservices enabling production monitoring, debugging, and performance analysis through metrics, logs, and traces.

**Philosophy**: Observability is systematic prevention for production - instrument systems to understand behavior, detect issues, and diagnose problems without guessing.

---

## When to Apply

Use these observability patterns when:

- Deploying services to production
- Debugging production issues
- Monitoring service health and performance
- Setting up alerts for critical conditions
- Analyzing request flows across services
- Optimizing performance bottlenecks

---

## Quick Reference

**Most Common Patterns**:

**1. Add Correlation ID Middleware** (TypeScript):
```typescript
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});
```

**2. Structured Logging** (Winston JSON):
```typescript
logger.info('Request processed', {
  correlation_id: req.correlationId,
  method: req.method,
  path: req.path,
  duration_ms: Date.now() - startTime,
});
```

**3. Prometheus RED Metrics**:
```typescript
// Rate
httpRequestsTotal.labels(method, route, status).inc();
// Errors
if (status >= 500) httpErrors.labels(method, route).inc();
// Duration
httpRequestDuration.labels(method, route).observe(duration);
```

**4. Health Check Endpoint**:
```typescript
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/ready', async (req, res) => {
  const dbHealthy = await checkDatabase();
  res.status(dbHealthy ? 200 : 503).json({ ready: dbHealthy });
});
```

**5. Alert on High Error Rate** (Prometheus):
```yaml
expr: |
  100 * (rate(http_requests_total{status=~"5.."}[5m]) /
         rate(http_requests_total[5m])) > 1
```

---

## Core Principles

- **Three Pillars**: Metrics (what's happening), Logs (why it happened), Traces (where it happened)
- **Correlation IDs**: Track requests across all services
- **Structured Logging**: JSON format for machine parsing
- **RED Metrics**: Rate, Errors, Duration for all services
- **Prometheus Format**: Standard metrics exposition
- **Sampling for Traces**: Balance detail vs overhead
- **Alert on Symptoms**: User-facing issues, not internal metrics
- **Dashboard by Service**: Each service has operational dashboard

## Step-by-Step Guidance

### 1. **Implement Correlation IDs**
   - Generate UUID for each request at entry point
   - Propagate via `X-Correlation-ID` header
   - Include in all log statements
   - Expected outcome: Trace requests across services

### 2. **Add Structured Logging**
   - Use winston (Node.js) or structlog (Python)
   - JSON format with consistent fields
   - Log levels: ERROR, WARN, INFO, DEBUG
   - Expected outcome: Machine-parseable logs

### 3. **Expose Prometheus Metrics**
   - Add `/metrics` endpoint to each service
   - Export RED metrics (rate, errors, duration)
   - Use client libraries (prom-client, prometheus-client)
   - Expected outcome: Metrics endpoint returning Prometheus format

### 4. **Add Distributed Tracing**
   - Instrument with OpenTelemetry
   - Export spans to Jaeger/Zipkin
   - Sample traces (1-10% in production)
   - Expected outcome: Request flow visualization

### 5. **Create Service Dashboard**
   - Grafana dashboard per service
   - RED metrics + health status
   - Error rate trends
   - Expected outcome: Operational visibility

### 6. **Configure Alerts**
   - Alert on high error rate (>1%)
   - Alert on high latency (p99 >1s)
   - Alert on service down
   - Expected outcome: Proactive issue detection

### 7. **Set Up Log Aggregation**
   - Centralize logs (Loki, ELK)
   - Retention policy (30 days)
   - Search by correlation ID
   - Expected outcome: Unified log view

## Examples

### Example 1: Correlation ID Middleware (Express)

Propagate correlation IDs through request chain:

```typescript
// services/routing/src/middleware/correlation.ts

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Middleware: Add or extract correlation ID.
 *
 * Extracts from X-Correlation-ID header if present,
 * otherwise generates new UUID.
 */
export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract or generate correlation ID
  const correlationId = req.headers['x-correlation-id'] as string || uuidv4();

  // Attach to request
  req.correlationId = correlationId;

  // Add to response headers for client tracking
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

// Usage in service
import express from 'express';
import { correlationMiddleware } from './middleware/correlation';

const app = express();

// Apply correlation middleware globally
app.use(correlationMiddleware);

// All routes now have access to req.correlationId
app.post('/v1/route', async (req, res) => {
  logger.info('Routing request received', {
    correlation_id: req.correlationId,
    request_type: req.body.type,
  });

  // When calling other services, propagate correlation ID
  const response = await fetch('http://knowledge-service:3000/metadata', {
    headers: {
      'X-Correlation-ID': req.correlationId,
    },
  });

  // ...
});
```

**Context**: Correlation IDs enable request tracing across services
**Expected Result**: Every log statement includes correlation ID for tracking

### Example 2: Structured Logging (Winston)

JSON-formatted logs with consistent structure:

```typescript
// services/routing/src/logger.ts

import winston from 'winston';
import { config } from './config';

/**
 * Create structured logger.
 *
 * Logs in JSON format with timestamp, level, message, and metadata.
 */
export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'routing-service',
    environment: config.nodeEnv,
  },
  transports: [
    new winston.transports.Console(),
  ],
});

// Usage in application code
import { logger } from './logger';

// Info log
logger.info('Routing request completed', {
  correlation_id: req.correlationId,
  request_type: 'file_path',
  matches_found: 3,
  duration_ms: 45,
});

// Error log with stack trace
try {
  const result = await processRequest(request);
} catch (error) {
  logger.error('Request processing failed', {
    correlation_id: req.correlationId,
    error: error.message,
    stack: error.stack,
    request_type: request.type,
  });
  throw error;
}

// Debug log (only in development)
logger.debug('Pattern matching details', {
  correlation_id: req.correlationId,
  patterns_checked: 25,
  pattern_matches: [
    { pattern: 'services/**/*.ts', confidence: 0.95 },
    { pattern: '**/*.ts', confidence: 0.85 },
  ],
});

// Example log output (JSON)
{
  "timestamp": "2025-10-27T10:30:45.123Z",
  "level": "info",
  "message": "Routing request completed",
  "service": "routing-service",
  "environment": "production",
  "correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "request_type": "file_path",
  "matches_found": 3,
  "duration_ms": 45
}
```

**Context**: Structured logs enable log aggregation and querying
**Expected Result**: All logs in consistent JSON format

### Example 3: Prometheus Metrics (Node.js)

Expose RED metrics (Rate, Errors, Duration):

```typescript
// services/routing/src/metrics.ts

import promClient from 'prom-client';
import express from 'express';

// Create registry
const register = new promClient.Registry();

// Default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics

// Counter: Total requests
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

// Histogram: Request duration
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Gauge: Active requests
const httpRequestsInProgress = new promClient.Gauge({
  name: 'http_requests_in_progress',
  help: 'HTTP requests currently in progress',
  labelNames: ['method', 'path'],
  registers: [register],
});

// Counter: Routing matches
const routingMatchesTotal = new promClient.Counter({
  name: 'routing_matches_total',
  help: 'Total routing matches returned',
  labelNames: ['request_type'],
  registers: [register],
});

/**
 * Middleware: Record metrics for all requests.
 */
export function metricsMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const start = Date.now();

  // Track in-progress
  httpRequestsInProgress.labels(req.method, req.path).inc();

  // On response finish
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    // Record request
    httpRequestsTotal.labels(req.method, req.path, String(res.statusCode)).inc();

    // Record duration
    httpRequestDuration
      .labels(req.method, req.path, String(res.statusCode))
      .observe(duration);

    // Decrement in-progress
    httpRequestsInProgress.labels(req.method, req.path).dec();
  });

  next();
}

/**
 * Metrics endpoint for Prometheus scraping.
 */
export async function metricsEndpoint(
  req: express.Request,
  res: express.Response
): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

// Usage in service
import express from 'express';
import { metricsMiddleware, metricsEndpoint } from './metrics';

const app = express();

// Apply metrics middleware
app.use(metricsMiddleware);

// Expose metrics endpoint
app.get('/metrics', metricsEndpoint);

// Record custom metrics in business logic
import { routingMatchesTotal } from './metrics';

async function route(request: RoutingRequest): Promise<RoutingResponse> {
  const matches = await findMatches(request);

  // Record custom metric
  routingMatchesTotal.labels(request.type).inc(matches.length);

  return { instructions: matches };
}
```

**Context**: Prometheus metrics enable performance monitoring and alerting
**Expected Result**: `/metrics` endpoint returns Prometheus-format metrics

### Example 4: Distributed Tracing (OpenTelemetry)

Instrument services for request tracing:

```typescript
// services/routing/src/tracing.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Initialize OpenTelemetry tracing.
 *
 * Auto-instruments Express, HTTP, and database clients.
 */
export function initTracing(): NodeSDK {
  const exporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'routing-service',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Auto-instrument HTTP, Express, pg, etc.
        '@opentelemetry/instrumentation-http': {},
        '@opentelemetry/instrumentation-express': {},
        '@opentelemetry/instrumentation-pg': {},
      }),
    ],
  });

  sdk.start();

  return sdk;
}

// Manual span creation for custom operations
import { trace } from '@opentelemetry/api';

async function findMatchingInstructions(
  type: string,
  value: string
): Promise<Match[]> {
  const tracer = trace.getTracer('routing-service');

  // Create custom span
  return tracer.startActiveSpan('findMatchingInstructions', async (span) => {
    span.setAttribute('request.type', type);
    span.setAttribute('request.value_length', value.length);

    try {
      const matches = await performMatching(type, value);

      span.setAttribute('matches.found', matches.length);
      span.setStatus({ code: 0 }); // OK

      return matches;
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

// Usage in index.ts
import { initTracing } from './tracing';

// Initialize tracing before starting server
const sdk = initTracing();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await sdk.shutdown();
});
```

**Context**: Distributed tracing visualizes request flow across services
**Expected Result**: Traces exported to Jaeger for analysis

### Example 5: Grafana Dashboard Configuration

Service dashboard with RED metrics:

```json
{
  "dashboard": {
    "title": "Routing Service",
    "tags": ["observability", "routing"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate (req/s)",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{service=\"routing-service\"}[5m])",
            "legendFormat": "{{method}} {{path}}"
          }
        ]
      },
      {
        "title": "Error Rate (%)",
        "type": "graph",
        "targets": [
          {
            "expr": "100 * (rate(http_requests_total{service=\"routing-service\",status=~\"5..\"}[5m]) / rate(http_requests_total{service=\"routing-service\"}[5m]))",
            "legendFormat": "Error Rate"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [1],
                "type": "gt"
              },
              "query": {
                "params": ["A", "5m", "now"]
              }
            }
          ],
          "name": "High Error Rate",
          "message": "Routing service error rate above 1%"
        }
      },
      {
        "title": "Request Duration (p50, p95, p99)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket{service=\"routing-service\"}[5m]))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service=\"routing-service\"}[5m]))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service=\"routing-service\"}[5m]))",
            "legendFormat": "p99"
          }
        ]
      },
      {
        "title": "Active Requests",
        "type": "graph",
        "targets": [
          {
            "expr": "http_requests_in_progress{service=\"routing-service\"}",
            "legendFormat": "{{method}} {{path}}"
          }
        ]
      },
      {
        "title": "Routing Matches",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(routing_matches_total{service=\"routing-service\"}[5m])",
            "legendFormat": "{{request_type}}"
          }
        ]
      }
    ]
  }
}
```

**Context**: Grafana dashboards provide operational visibility
**Expected Result**: Real-time service health monitoring

## Validation Checklist

Before considering observability complete:

- [ ] Correlation ID middleware added to all services
- [ ] Structured logging with winston/structlog
- [ ] All logs include correlation_id field
- [ ] Prometheus `/metrics` endpoint exposed
- [ ] RED metrics implemented (rate, errors, duration)
- [ ] Custom business metrics added
- [ ] Distributed tracing with OpenTelemetry
- [ ] Traces exported to Jaeger/Zipkin
- [ ] Grafana dashboard created per service
- [ ] Alerts configured for high error rate
- [ ] Alerts configured for high latency
- [ ] Log aggregation set up (Loki/ELK)
- [ ] Retention policies configured
- [ ] Runbooks linked from alerts

## Common Pitfalls

### Pitfall 1: Missing Correlation IDs

- ❌ **Problem**: Can't trace requests across services
- **Why it happens**: Not propagating correlation ID in headers
- ✅ **Solution**: Add correlation middleware, propagate in all service calls
- **Example**: Debugging cross-service issue requires manual correlation

### Pitfall 2: Unstructured Logs

- ❌ **Problem**: Logs not parseable, can't search/aggregate
- **Why it happens**: Using console.log instead of structured logger
- ✅ **Solution**: Use winston/structlog with JSON format
- **Example**: "Error processing request" - no context, can't filter

### Pitfall 3: No Sampling for Traces

- ❌ **Problem**: Tracing overhead kills performance
- **Why it happens**: Tracing 100% of requests in production
- ✅ **Solution**: Sample 1-10% of traces in production
- **Example**: Tracing adds 50ms to every request

### Pitfall 4: Alerting on Everything

- ❌ **Problem**: Alert fatigue, ignore critical alerts
- **Why it happens**: Alerting on internal metrics, not symptoms
- ✅ **Solution**: Alert only on user-facing issues (high error rate, latency)
- **Example**: CPU alert fires constantly, team ignores it

### Pitfall 5: No Log Retention Policy

- ❌ **Problem**: Log storage grows unbounded, expensive
- **Why it happens**: Not configuring retention
- ✅ **Solution**: 30-day retention, archive critical logs
- **Example**: 1TB of logs after 6 months

## Edge Cases

### Edge Case 1: High-Cardinality Metrics

**When**: Metric labels have many unique values (user IDs, URLs)
**Approach**:
- Avoid high-cardinality labels in Prometheus
- Use aggregation (error count, not per-user)
- For detailed analysis, use logs/traces instead
**Example**: Label by endpoint, not by full URL path

### Edge Case 2: PII in Logs

**When**: Personal identifiable information in log messages
**Approach**:
- Sanitize sensitive data before logging
- Hash or redact user IDs, emails, tokens
- Document what's safe to log
**Example**: Log user_id hash, not email address

### Edge Case 3: Distributed Tracing Sampling

**When**: Need to trace specific high-value requests
**Approach**:
- Sample 100% for canary requests
- Sample 100% for errors
- Sample 1-10% for normal traffic
**Example**: Always trace requests with debug header

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Can't trace cross-service requests | Missing correlation IDs | Add correlation middleware, propagate headers |
| Logs not searchable | Unstructured format | Use winston/structlog with JSON |
| Prometheus scrape fails | No /metrics endpoint | Add metrics endpoint |
| Tracing overhead high | No sampling | Sample 1-10% in production |
| Too many alerts | Alerting on internals | Alert on user-facing symptoms only |
| Log storage expensive | No retention policy | Configure 30-day retention |
| Missing traces for errors | Sampling drops errors | Always sample error traces |
| Dashboard shows no data | Incorrect Prometheus query | Verify metric names, labels |

## Related Instructions

**Core Integration**:
- [Microservices Development](../development_standards/microservices_development.instructions.md) - Health checks and metrics basics for services
- [Performance Optimization](./performance_optimization.instructions.md) - Using metrics to identify bottlenecks, profiling with observability data
- [Error Handling](../development_standards/error_handling.instructions.md) - What to log in error scenarios, structured error logging

**Deployment & Configuration**:
- [CI/CD Pipelines](./ci_cd_pipelines.instructions.md) - Metrics collection in deployment pipelines, health checks before release
- [Docker Compose Orchestration](../development_standards/docker_compose_orchestration.instructions.md) - Local observability stack setup (Prometheus, Grafana, Jaeger)
- [Environment Configuration](../quality/environment_configuration.instructions.md) - Observability service URLs, sampling rates, log levels

**Security & Quality**:
- [Security Hardening](./security_hardening.instructions.md) - What NOT to log (secrets, PII), secure metrics endpoints
- [Testing Standards](../quality/testing_standards.instructions.md) - Testing observability integration, validating metrics accuracy

---

**Success Criteria**: All services expose /metrics endpoint, logs are structured JSON with correlation IDs, distributed tracing configured, Grafana dashboards operational, alerts configured for high error rate and latency.

**Confidence Check**: Can you trace a request across all services using correlation ID? Are all logs in JSON format? Does Grafana show RED metrics for each service? Do alerts fire for high error rates?
