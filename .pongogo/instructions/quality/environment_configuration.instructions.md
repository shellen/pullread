---
pongogo_instruction_spec: "0.0.2"
title: "Environment Configuration"
description: "Environment configuration standards, validation, and consistency patterns."
applies_to:
  - "**/*"
domains:
  - "quality"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - environment_configuration
      - env_file
      - .env
      - config_validation
      - secrets_management
      - environment_variables
      - dotenv
      - pydantic_config
      - zod_config
      - type-safe_config
      - fail_fast_config
    nlp: "Environment configuration management including .env patterns, config validation, secrets management"
evaluation:
  success_signals:
    - Config validated at startup with Zod/Pydantic before any operations
    - Service fails fast with clear error on missing required variables
    - .env.example documents all variables with descriptions and examples
    - .env files in .gitignore, secrets never committed to git
    - Type-safe config module exports validated typed config object
  failure_signals:
    - Service runs with defaults for missing critical config (silent failure)
    - Secrets committed to git history (DATABASE_URL with password)
    - process.env accessed directly throughout codebase (not centralized)
    - No .env.example file documenting required variables
    - Config validation at runtime instead of startup (late failures)
---


# Environment Configuration Standards

**Purpose**: Establish comprehensive environment configuration management ensuring secure, validated, environment-specific settings with systematic prevention of configuration errors.

**Philosophy**: Configuration is code - validate it, version it (except secrets), and fail fast on misconfiguration rather than running with defaults.

---

## When to Apply

Use these configuration standards when:

- Setting up new services or environments
- Adding environment variables
- Managing secrets and credentials
- Configuring service dependencies
- Deploying to different environments

---

## Quick Reference

**Key Environment Configuration Patterns (Code Examples)**:

**1. .env.example Template**:
```bash
# .env.example
# Copy to .env and fill in values
# DO NOT commit .env with real secrets

# ===== Service Configuration =====
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# ===== Database =====
# Format: postgresql://user:password@host:port/database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/{project}
DATABASE_POOL_SIZE=10

# ===== External Services =====
KNOWLEDGE_SERVICE_URL=http://knowledge-service:3000

# ===== Feature Flags =====
ENABLE_DEBUG_ENDPOINTS=true

# ===== Security =====
# API_KEY=your-secret-api-key-here
CORS_ALLOWED_ORIGINS=http://localhost:3000

# ===== Observability =====
# SENTRY_DSN=https://...
ENABLE_METRICS=false
METRICS_PORT=9090
```

**2. Type-Safe Config (TypeScript + Zod)**:
```typescript
// services/routing/src/config.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Required - will fail if missing
  databaseUrl: z.string().url(),
  knowledgeServiceUrl: z.string().url(),

  // Optional with defaults
  routingConfidenceThreshold: z.coerce.number().min(0).max(1).default(0.5),

  // Boolean from string
  enableDebugEndpoints: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  try {
    return ConfigSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      databaseUrl: process.env.DATABASE_URL,
      // ... all env vars
    });
  } catch (error) {
    console.error('❌ Configuration validation failed:');
    // Print helpful error messages
    process.exit(1);
  }
}

export const config = loadConfig();
```

**3. Type-Safe Config (Python + Pydantic)**:
```python
# services/routing/config.py
from pydantic import BaseSettings, Field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class Config(BaseSettings):
    """Application configuration with validation."""

    # Service
    node_env: str = Field(default="development")
    port: int = Field(default=3000, ge=1, le=65535)

    # Database (required)
    database_url: str = Field(..., env="DATABASE_URL")
    database_pool_size: int = Field(default=10, ge=1, le=100)

    # Feature flags
    enable_debug_endpoints: bool = Field(default=False)

    # Security
    api_key: Optional[str] = Field(None)

    @validator("api_key")
    def validate_api_key_in_production(cls, v, values):
        """Require API key in production."""
        if values.get("node_env") == "production" and not v:
            raise ValueError("api_key required in production")
        return v

    class Config:
        env_file = ".env"

# Load configuration (fails fast if invalid)
config = Config()
```

**4. Environment-Specific Configs**:
```typescript
// config/production.ts
export const productionConfig = {
  database: {
    poolSize: 20,
    ssl: true,  // Always in production
  },
  features: {
    debugEndpoints: false,  // Never in production
    detailedErrors: false,  // Hide errors
  },
  cache: {
    ttl: 600,  // 10 minutes
  },
};

// config/development.ts
export const developmentConfig = {
  database: {
    poolSize: 5,
    ssl: false,
  },
  features: {
    debugEndpoints: true,  // Enable in dev
    detailedErrors: true,  // Show full errors
  },
  cache: {
    ttl: 60,  // 1 minute
  },
};
```

**5. Config Validation Tests**:
```typescript
describe('Config', () => {
  test('fails with missing required DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => {
      require('./config');
    }).toThrow(/database_url/i);
  });

  test('fails with invalid PORT number', () => {
    process.env.PORT = '70000';  // > 65535

    expect(() => {
      require('./config');
    }).toThrow(/port/i);
  });

  test('uses default values for optional config', () => {
    const { config } = require('./config');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });
});
```

**6. .gitignore for Config**:
```gitignore
# NEVER commit real secrets
.env
.env.local
.env.production
.env.staging

# DO commit example (no real secrets)
# .env.example  ← This should be committed

# Config with secrets
config/local.json
config/production.json
config/secrets.yaml

# DO commit config templates
# config/template.json
# config/example.yaml
```

**7. Config Loading Checklist**:
```typescript
// At service startup:
// 1. Load environment variables
dotenv.config();

// 2. Validate config (fail fast)
const config = loadConfig();

// 3. Log config (without secrets)
logger.info('Config loaded', {
  nodeEnv: config.nodeEnv,
  port: config.port,
  // NEVER log: apiKey, databaseUrl with password
});

// 4. Check critical dependencies
await checkDatabaseConnection();
await checkExternalServices();

// 5. Start service
app.listen(config.port);
```

---

## Core Principles

- **Never Commit Secrets**: Use .env files, never commit to git
- **Validate at Startup**: Check all required env vars before running
- **Fail Fast on Missing**: No silent defaults for critical config
- **.env.example Committed**: Document all required variables
- **Type-Safe Config**: Validate types, not just presence
- **Environment-Specific**: dev/staging/production configs separated
- **Documentation Required**: Comment purpose of each variable
- **Defaults for Non-Secrets**: Reasonable defaults for non-critical config

## Step-by-Step Guidance

### 1. **Define Required Variables**
   - List all environment variables needed
   - Categorize: secrets, URLs, feature flags, tuning
   - Document purpose and valid values
   - Expected outcome: Complete list of required config

### 2. **Create .env.example**
   - Document all variables with descriptions
   - Include example values (not real secrets)
   - Commit to git for documentation
   - Expected outcome: Developers know what config needed

### 3. **Implement Config Validation**
   - Load variables at startup
   - Validate presence of required vars
   - Validate types and formats
   - Fail with clear error if invalid
   - Expected outcome: Service won't start with bad config

### 4. **Use Config Module**
   - Centralize config loading in one module
   - Export typed config object
   - Single source of truth
   - Expected outcome: Config accessed through typed module

### 5. **Add to .gitignore**
   - Ensure .env files in .gitignore
   - Never commit actual secrets
   - Use .env.example for documentation
   - Expected outcome: Secrets never in git history

### 6. **Document Deployment**
   - Document how to set env vars in production
   - Kubernetes secrets, AWS Parameter Store, etc.
   - Include in deployment docs
   - Expected outcome: Clear deployment process

### 7. **Test Config Validation**
   - Test service fails with missing vars
   - Test service fails with invalid types
   - Test defaults work correctly
   - Expected outcome: Config validation tested

## Examples

### Example 1: .env.example Template

Comprehensive .env.example:

```bash
# .env.example
# Copy this file to .env and fill in values
# DO NOT commit .env file with real secrets

# ===== Service Configuration =====
# Node environment (development, staging, production)
NODE_ENV=development

# Service port
PORT=3000

# Log level (debug, info, warn, error)
LOG_LEVEL=info

# ===== Database Configuration =====
# PostgreSQL connection string
# Format: postgresql://user:password@host:port/database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/{project}_routing

# Database connection pool size
DATABASE_POOL_SIZE=10

# ===== External Services =====
# Knowledge service URL
KNOWLEDGE_SERVICE_URL=http://knowledge-service:3000

# Orchestration service URL (optional for standalone mode)
# ORCHESTRATION_SERVICE_URL=http://orchestration-service:3000

# ===== Feature Flags =====
# Enable debug endpoints (true/false) - ONLY true in development
ENABLE_DEBUG_ENDPOINTS=true

# Enable request correlation IDs (true/false)
ENABLE_CORRELATION_IDS=true

# ===== Routing Configuration =====
# Minimum confidence threshold for returning matches (0.0-1.0)
ROUTING_CONFIDENCE_THRESHOLD=0.5

# Maximum number of results to return
ROUTING_MAX_RESULTS=10

# Cache TTL for metadata in seconds
ROUTING_CACHE_TTL=300

# ===== Security =====
# API key for external requests (required in production)
# API_KEY=your-secret-api-key-here

# CORS allowed origins (comma-separated)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# ===== Observability =====
# Sentry DSN for error tracking (optional)
# SENTRY_DSN=https://...

# Enable metrics export (true/false)
ENABLE_METRICS=false

# Metrics export port
METRICS_PORT=9090
```

**Context**: Complete .env.example documents all configuration
**Expected Result**: Developers understand all config requirements

### Example 2: Type-Safe Config Module (TypeScript)

Validated, typed configuration:

```typescript
// services/routing/src/config.ts

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Configuration schema with validation.
 */
const ConfigSchema = z.object({
  // Service
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  databaseUrl: z.string().url(),
  databasePoolSize: z.coerce.number().int().min(1).max(100).default(10),

  // External Services
  knowledgeServiceUrl: z.string().url(),
  orchestrationServiceUrl: z.string().url().optional(),

  // Feature Flags
  enableDebugEndpoints: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  enableCorrelationIds: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),

  // Routing Configuration
  routingConfidenceThreshold: z.coerce.number().min(0).max(1).default(0.5),
  routingMaxResults: z.coerce.number().int().min(1).max(100).default(10),
  routingCacheTtl: z.coerce.number().int().min(0).default(300),

  // Security
  apiKey: z.string().optional(),
  corsAllowedOrigins: z
    .string()
    .transform((val) => val.split(','))
    .default('http://localhost:3000'),

  // Observability
  sentryDsn: z.string().url().optional(),
  enableMetrics: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  metricsPort: z.coerce.number().int().min(1).max(65535).default(9090),
});

/**
 * Validated configuration type.
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate configuration.
 * Throws error if configuration invalid.
 */
function loadConfig(): Config {
  try {
    const config = ConfigSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
      databaseUrl: process.env.DATABASE_URL,
      databasePoolSize: process.env.DATABASE_POOL_SIZE,
      knowledgeServiceUrl: process.env.KNOWLEDGE_SERVICE_URL,
      orchestrationServiceUrl: process.env.ORCHESTRATION_SERVICE_URL,
      enableDebugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS,
      enableCorrelationIds: process.env.ENABLE_CORRELATION_IDS,
      routingConfidenceThreshold: process.env.ROUTING_CONFIDENCE_THRESHOLD,
      routingMaxResults: process.env.ROUTING_MAX_RESULTS,
      routingCacheTtl: process.env.ROUTING_CACHE_TTL,
      apiKey: process.env.API_KEY,
      corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
      sentryDsn: process.env.SENTRY_DSN,
      enableMetrics: process.env.ENABLE_METRICS,
      metricsPort: process.env.METRICS_PORT,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      console.error('');

      error.errors.forEach((err) => {
        const envVar = err.path.join('_').toUpperCase();
        console.error(`  ${envVar}: ${err.message}`);
      });

      console.error('');
      console.error('Please check your .env file and ensure all required variables are set.');
      console.error('See .env.example for reference.');

      process.exit(1);
    }

    throw error;
  }
}

/**
 * Validated configuration object.
 * Use this throughout the application.
 */
export const config = loadConfig();

/**
 * Check if running in production.
 */
export const isProduction = config.nodeEnv === 'production';

/**
 * Check if running in development.
 */
export const isDevelopment = config.nodeEnv === 'development';
```

**Context**: Type-safe config with validation at startup
**Expected Result**: Service fails fast with clear error on misconfiguration

### Example 3: Python Config with Pydantic

Type-safe Python configuration:

```python
# services/routing/config.py

from pydantic import BaseSettings, Field, validator
from typing import Optional, List
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()


class Config(BaseSettings):
    """
    Application configuration with validation.

    All settings loaded from environment variables.
    """

    # Service
    node_env: str = Field(default="development", env="NODE_ENV")
    port: int = Field(default=3000, ge=1, le=65535, env="PORT")
    log_level: str = Field(default="info", env="LOG_LEVEL")

    # Database
    database_url: str = Field(..., env="DATABASE_URL")  # Required
    database_pool_size: int = Field(default=10, ge=1, le=100)

    # External Services
    knowledge_service_url: str = Field(..., env="KNOWLEDGE_SERVICE_URL")
    orchestration_service_url: Optional[str] = Field(None)

    # Feature Flags
    enable_debug_endpoints: bool = Field(default=False)
    enable_correlation_ids: bool = Field(default=True)

    # Routing Configuration
    routing_confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    routing_max_results: int = Field(default=10, ge=1, le=100)
    routing_cache_ttl: int = Field(default=300, ge=0)

    # Security
    api_key: Optional[str] = Field(None)
    cors_allowed_origins: str = Field(default="http://localhost:3000")

    # Observability
    sentry_dsn: Optional[str] = Field(None)
    enable_metrics: bool = Field(default=False)
    metrics_port: int = Field(default=9090, ge=1, le=65535)

    @validator("log_level")
    def validate_log_level(cls, v):
        """Validate log level is valid."""
        valid_levels = ["debug", "info", "warn", "error"]
        if v.lower() not in valid_levels:
            raise ValueError(f"log_level must be one of {valid_levels}")
        return v.lower()

    @validator("node_env")
    def validate_node_env(cls, v):
        """Validate node environment."""
        valid_envs = ["development", "staging", "production"]
        if v.lower() not in valid_envs:
            raise ValueError(f"node_env must be one of {valid_envs}")
        return v.lower()

    @validator("api_key")
    def validate_api_key_in_production(cls, v, values):
        """Require API key in production."""
        if values.get("node_env") == "production" and not v:
            raise ValueError("api_key required in production")
        return v

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.node_env == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.node_env == "development"

    @property
    def cors_origins_list(self) -> List[str]:
        """Get CORS origins as list."""
        return [origin.strip() for origin in self.cors_allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False  # Allow case-insensitive env vars


# Load and validate configuration
try:
    config = Config()
except Exception as e:
    print(f"❌ Configuration validation failed: {e}")
    print("")
    print("Please check your .env file and ensure all required variables are set.")
    print("See .env.example for reference.")
    exit(1)
```

**Context**: Pydantic validates Python config with types
**Expected Result**: Clear validation errors on startup

### Example 4: Environment-Specific Configs

Separate configs for different environments:

```typescript
// services/routing/src/config/index.ts

import { developmentConfig } from './development';
import { stagingConfig } from './staging';
import { productionConfig } from './production';

export interface ServiceConfig {
  database: {
    url: string;
    poolSize: number;
    ssl: boolean;
  };
  cache: {
    ttl: number;
    maxSize: number;
  };
  features: {
    debugEndpoints: boolean;
    detailedErrors: boolean;
  };
}

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Get configuration for current environment.
 */
export function getConfig(): ServiceConfig {
  switch (NODE_ENV) {
    case 'production':
      return productionConfig;
    case 'staging':
      return stagingConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

// services/routing/src/config/production.ts
export const productionConfig: ServiceConfig = {
  database: {
    url: process.env.DATABASE_URL!,
    poolSize: 20,
    ssl: true,
  },
  cache: {
    ttl: 600, // 10 minutes
    maxSize: 10000,
  },
  features: {
    debugEndpoints: false, // Never in production
    detailedErrors: false, // Hide errors in production
  },
};

// services/routing/src/config/development.ts
export const developmentConfig: ServiceConfig = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/{project}_dev',
    poolSize: 5,
    ssl: false,
  },
  cache: {
    ttl: 60, // 1 minute
    maxSize: 100,
  },
  features: {
    debugEndpoints: true, // Enable in dev
    detailedErrors: true, // Show full errors in dev
  },
};
```

**Context**: Environment-specific configs with appropriate defaults
**Expected Result**: Safe defaults per environment

### Example 5: Config Validation Tests

Test config validation:

```typescript
// services/routing/src/config.test.ts

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('loads valid config successfully', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.KNOWLEDGE_SERVICE_URL = 'http://localhost:3000';

    const { config } = require('./config');

    expect(config.databaseUrl).toBe('postgresql://localhost/test');
    expect(config.knowledgeServiceUrl).toBe('http://localhost:3000');
  });

  test('fails with missing required DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    process.env.KNOWLEDGE_SERVICE_URL = 'http://localhost:3000';

    expect(() => {
      require('./config');
    }).toThrow();
  });

  test('fails with invalid PORT number', () => {
    process.env.PORT = '70000'; // Invalid: > 65535
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.KNOWLEDGE_SERVICE_URL = 'http://localhost:3000';

    expect(() => {
      require('./config');
    }).toThrow(/port/i);
  });

  test('uses default values for optional config', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.KNOWLEDGE_SERVICE_URL = 'http://localhost:3000';

    const { config } = require('./config');

    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.routingConfidenceThreshold).toBe(0.5);
  });

  test('parses boolean environment variables correctly', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.KNOWLEDGE_SERVICE_URL = 'http://localhost:3000';
    process.env.ENABLE_DEBUG_ENDPOINTS = 'true';

    const { config } = require('./config');

    expect(config.enableDebugEndpoints).toBe(true);
  });
});
```

**Context**: Test config validation catches issues
**Expected Result**: Config validation tested and working

## Validation Checklist

For configuration setup:

- [ ] .env.example created with all variables documented
- [ ] .env added to .gitignore
- [ ] Config validation implemented (zod/pydantic)
- [ ] Service fails fast on missing required config
- [ ] Type-safe config module created
- [ ] All secrets loaded from env vars (never hardcoded)
- [ ] Reasonable defaults for non-secrets
- [ ] Config validation tested
- [ ] Environment-specific configs separated
- [ ] Deployment documentation includes env var setup

## Common Pitfalls

### Pitfall 1: Committing Secrets

- ❌ **Problem**: .env file with secrets committed to git
- **Why it happens**: Forgetting .gitignore
- ✅ **Solution**: Add .env to .gitignore, commit .env.example only
- **Example**: DATABASE_URL with password in git history

### Pitfall 2: Silent Defaults for Critical Config

- ❌ **Problem**: Service runs with wrong config, fails later
- **Why it happens**: Using defaults for required vars
- ✅ **Solution**: Fail fast at startup if required vars missing
- **Example**: DATABASE_URL defaults to localhost, connects to wrong DB

### Pitfall 3: No Config Validation

- ❌ **Problem**: Invalid config (wrong type, invalid value) causes runtime errors
- **Why it happens**: Not validating config at startup
- ✅ **Solution**: Use zod/pydantic to validate types and constraints
- **Example**: PORT="abc" passes, crashes later

### Pitfall 4: Missing .env.example

- ❌ **Problem**: Developers don't know what config needed
- **Why it happens**: Not documenting required variables
- ✅ **Solution**: Commit .env.example with all variables and descriptions
- **Example**: New developer can't start service

### Pitfall 5: Environment Variables in Code

- ❌ **Problem**: `process.env.VAR` scattered throughout codebase
- **Why it happens**: Not using centralized config module
- ✅ **Solution**: Load env vars once in config module, import typed config
- **Example**: Can't mock config in tests

## Edge Cases

### Edge Case 1: Config Changes Requiring Restart

**When**: Environment variables changed after service started
**Approach**:
- Document that service restart required
- Consider hot-reload for non-critical config
- Use feature flags for runtime toggles
**Example**: Changing log level requires restart

### Edge Case 2: Secret Rotation

**When**: API keys/passwords need to be rotated
**Approach**:
- Document rotation process
- Use secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Support grace period with both old and new keys
**Example**: DATABASE_PASSWORD changed, need rolling deployment

### Edge Case 3: Multi-Tenant Configuration

**When**: Same service serves multiple tenants with different config
**Approach**:
- Base config from env vars
- Tenant-specific overrides from database/config service
- Clear precedence: tenant > env > defaults
**Example**: Per-tenant API rate limits

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Service won't start | Missing required env var | Check error message, add var to .env |
| Config validation fails | Invalid value or type | Fix value in .env to match schema |
| Secrets exposed in logs | Logging config object | Filter secrets before logging |
| Different behavior locally vs prod | Different env vars | Document all env vars in .env.example |
| Can't test with different config | Config loaded at module level | Make config injectable for testing |
| Service uses wrong DB | Wrong DATABASE_URL | Check .env file, verify config loading |
| Secrets committed to git | .env not in .gitignore | Add to .gitignore, rotate secrets, remove from history |

## Related Instructions

- **See also**: [systematic_prevention_framework.instructions.md](../safety_prevention/systematic_prevention_framework.instructions.md) - Prevent config errors systematically
- **See also**: [agent_environment_setup.instructions.md](../agentic_workflows/agent_environment_setup.instructions.md) - Zero-config service setup
- **Related**: [dependency_management.instructions.md](./dependency_management.instructions.md) - Managing config dependencies

---

**Success Criteria**: All config validated at startup, .env.example documents all variables, secrets never committed, service fails fast on misconfiguration, config module is type-safe.

**Confidence Check**: Is config validated at startup? Does .env.example exist and document all variables? Are secrets in .gitignore? Does service fail clearly on missing config?
