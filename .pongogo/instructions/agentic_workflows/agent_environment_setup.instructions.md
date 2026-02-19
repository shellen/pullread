---
pongogo_instruction_spec: "0.0.2"
title: "Agent Environment Setup"
description: "Agent environment setup, initialization, and capability detection guidance."
applies_to:
  - "**/*"
domains:
  - "agentic_workflows"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - environment_setup
      - zero-configuration
      - docker_compose
      - dev_container
      - devcontainer
      - structured_output
      - machine-readable
      - JSON_output
      - graceful_failure
      - health_check
      - health_endpoint
      - diagnostic
      - diagnose
      - npm_run
      - sensible_defaults
      - environment_validation
      - bootstrap
      - setup_script
      - service_discovery
      - pino
      - structured_logging
      - agent-friendly_error
      - recovery_steps
    nlp: "Setting up development environments that work automatically for AI agents with structured output and graceful failures"
evaluation:
  success_signals:
    - Zero-configuration bootstrap works (docker-compose up)
    - All tools produce JSON output option
    - Errors include actionable recovery steps
    - Health check endpoints return structured status
    - Diagnostic command available (npm run diagnose)
  failure_signals:
    - Manual configuration required before services start
    - Tool output unstructured (human-readable only)
    - Error messages lack recovery guidance
    - Health checks missing or always failing
    - No diagnostic capability available
---


# Agent Environment Setup Standards

**Purpose**: Establish development environment and tooling standards that enable zero-configuration agent bootstrap, structured output for parsing, and graceful failures with actionable recovery steps.

**Philosophy**: Agents are first-class developers - environment setup must be automatic, tool output must be machine-readable, and failures must provide clear recovery paths.

---

## When to Apply

Use these standards when:

- Setting up development containers or local development environments
- Creating scripts or automation tools for agent use
- Designing CI/CD workflows that agents will interact with
- Implementing configuration management for services
- Building tooling for routing service, audit service, or knowledge system
- Writing documentation that agents will consume to set up environments

---

## Quick Reference

**Most Common Patterns**:

**1. Progressive Permission Request**:
- Start: Basic repository scan (read-only)
- Demonstrate: Show analysis and suggestions
- Request: "To auto-fix issues, grant write access to `src/`"
- Explain: "This enables automatic PR creation for validation fixes"

**2. Service Discovery** (Docker Compose):
```yaml
services:
  routing-service:
    environment:
      KNOWLEDGE_SERVICE_URL: http://knowledge-service:3000
```

**3. Machine-Readable Tool Output** (JSON):
```bash
# Bad: Human-friendly output
echo "Service started successfully"

# Good: Machine-parseable JSON
echo '{"status": "success", "service": "routing", "port": 3000}' | jq
```

**4. Automatic Dependency Detection**:
```bash
# Check required tools exist
for cmd in docker jq gh; do
  command -v $cmd >/dev/null || echo "ERROR: $cmd not installed"
done
```

**5. Self-Healing Setup Script**:
```bash
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi
```

---

## Core Principles

- **Progressive Integration**: Start with minimal setup, demonstrate value, then request additional permissions/integrations as needed with clear benefit explanations
- **Structured Output**: All tools produce machine-readable output (JSON, YAML, parseable text) for programmatic consumption
- **Graceful Failures**: Errors include actionable recovery steps, not just error messages
- **Consistent Interfaces**: Standard file locations, naming conventions, and entry points across all services
- **Automatic Discovery**: Tools and configs live in predictable locations that agents can find without documentation

## Step-by-Step Guidance

### Step 1: Design Zero-Configuration Development Environment

Create development environments that work immediately without manual configuration.

1. **Use Docker Compose for Local Development**:
   ```yaml
   # docker-compose.yml - Agents can start entire stack with one command
   version: '3.8'
   services:
     routing-service:
       build: ./services/routing
       environment:
         - NODE_ENV=development
         - DB_HOST=postgres
       ports:
         - "3001:3000"
       depends_on:
         - postgres
       volumes:
         - ./knowledge:/app/knowledge:ro  # Auto-mount knowledge base

     audit-service:
       build: ./services/audit
       environment:
         - NODE_ENV=development
         - DB_HOST=postgres
       ports:
         - "3002:3000"
       depends_on:
         - postgres

     postgres:
       image: postgres:15
       environment:
         - POSTGRES_DB={database}
         - POSTGRES_PASSWORD=devpass  # Sensible default for dev
       volumes:
         - pgdata:/var/lib/postgresql/data

   volumes:
     pgdata:
   ```
   - Expected outcome: Agent runs `docker-compose up` and entire environment works
   - Rationale: No manual database setup, service configuration, or dependency installation

2. **Provide Sensible Defaults for All Settings**:
   ```typescript
   // config/defaults.ts - Every setting has a working default
   export const defaultConfig = {
     server: {
       port: process.env.PORT || 3000,
       host: process.env.HOST || '0.0.0.0'
     },
     database: {
       host: process.env.DB_HOST || 'localhost',
       port: parseInt(process.env.DB_PORT || '5432'),
       name: process.env.DB_NAME || '{database}',
       user: process.env.DB_USER || '{database}',
       password: process.env.DB_PASSWORD || 'devpass'
     },
     knowledge: {
       basePath: process.env.KNOWLEDGE_PATH || './knowledge',
       instructionsPath: process.env.INSTRUCTIONS_PATH || './knowledge/instructions'
     }
   };
   ```
   - Success indicator: Service starts successfully with no env vars set

3. **Implement Environment Validation with Clear Error Messages**:
   ```typescript
   // Validate on startup, provide actionable errors
   export function validateEnvironment(): ValidationResult {
     const errors: string[] = [];

     if (!fs.existsSync(config.knowledge.instructionsPath)) {
       errors.push(
         `Instructions path not found: ${config.knowledge.instructionsPath}\n` +
         `Action: Run 'npm run setup' or set INSTRUCTIONS_PATH environment variable`
       );
     }

     if (config.database.password === 'devpass' && config.server.env === 'production') {
       errors.push(
         `Default password detected in production\n` +
         `Action: Set DB_PASSWORD environment variable to secure password`
       );
     }

     return {
       valid: errors.length === 0,
       errors,
       warnings: []
     };
   }
   ```
   - Expected outcome: Clear, actionable error messages guide agent to resolution
   - Integration point: Agents can parse structured error output

### Step 2: Create Structured Output for All Tools

Design tools to produce machine-readable output that agents can parse programmatically.

1. **Use JSON for Programmatic Output**:
   ```bash
   #!/bin/bash
   # scripts/validate-instructions.sh - Produces JSON output

   results=()
   exit_code=0

   for file in knowledge/instructions/**/*.instructions.md; do
     if ! validate_frontmatter "$file"; then
       results+=("{\"file\": \"$file\", \"status\": \"error\", \"message\": \"Invalid frontmatter\"}")
       exit_code=1
     else
       results+=("{\"file\": \"$file\", \"status\": \"ok\"}")
     fi
   done

   # Output valid JSON array
   echo "["
   printf '%s\n' "${results[@]}" | paste -sd ',' -
   echo "]"

   exit $exit_code
   ```
   - Expected outcome: Agent parses JSON to understand validation results

2. **Provide Human-Readable and Machine-Readable Modes**:
   ```typescript
   // CLI tools support both modes
   import yargs from 'yargs';

   const argv = yargs
     .option('format', {
       choices: ['human', 'json', 'yaml'],
       default: 'human',
       description: 'Output format'
     })
     .parse();

   if (argv.format === 'json') {
     console.log(JSON.stringify(results, null, 2));
   } else if (argv.format === 'yaml') {
     console.log(yaml.dump(results));
   } else {
     // Human-readable table format
     console.table(results);
   }
   ```
   - Success indicator: Agents use `--format json`, humans use default

3. **Include Metadata in Output**:
   ```json
   {
     "timestamp": "2025-10-27T12:00:00Z",
     "command": "validate-instructions",
     "version": "0.1.0",
     "results": [
       {
         "file": "task_creation_workflow.instructions.md",
         "status": "ok",
         "checks": ["frontmatter", "structure", "links"]
       }
     ],
     "summary": {
       "total": 8,
       "passed": 8,
       "failed": 0
     },
     "exit_code": 0
   }
   ```
   - Rationale: Agents need context (timestamp, version) for decision-making

### Step 3: Implement Graceful Failure with Recovery Steps

Ensure all failures provide clear, actionable recovery instructions.

1. **Structure Error Messages with Actions**:
   ```typescript
   export class AgentFriendlyError extends Error {
     constructor(
       message: string,
       public action: string,
       public context?: Record<string, any>
     ) {
       super(message);
       this.name = 'AgentFriendlyError';
     }

     toJSON() {
       return {
         error: this.message,
         action: this.action,
         context: this.context,
         timestamp: new Date().toISOString()
       };
     }
   }

   // Usage
   if (!instructionFile.exists) {
     throw new AgentFriendlyError(
       `Instruction file not found: ${filename}`,
       `Create file at: ${expectedPath}\nOr check INSTRUCTIONS_PATH environment variable`,
       { filename, expectedPath, currentPath: process.cwd() }
     );
   }
   ```
   - Expected outcome: Agents know exactly what to do to fix the error

2. **Provide Diagnostic Commands**:
   ```bash
   # scripts/diagnose.sh - Helps agents troubleshoot
   echo "=== Environment Diagnostics ==="
   echo ""

   echo "Node version: $(node --version)"
   echo "Docker version: $(docker --version)"
   echo "Docker Compose version: $(docker-compose --version)"
   echo ""

   echo "Knowledge base path: ${KNOWLEDGE_PATH:-./knowledge}"
   if [ -d "${KNOWLEDGE_PATH:-./knowledge}" ]; then
     echo "✓ Knowledge base found"
     echo "  Instruction files: $(find ${KNOWLEDGE_PATH:-./knowledge}/instructions -name '*.instructions.md' | wc -l)"
   else
     echo "✗ Knowledge base not found"
     echo "  Action: Run 'git submodule update --init' or set KNOWLEDGE_PATH"
   fi
   echo ""

   echo "Services status:"
   docker-compose ps --format json | jq -r '.[] | "  \(.Service): \(.State)"'
   ```
   - Success indicator: Agents run diagnostic, understand environment state

3. **Implement Automatic Retries with Backoff**:
   ```typescript
   async function withRetry<T>(
     fn: () => Promise<T>,
     options: {
       maxRetries: number;
       backoffMs: number;
       onRetry?: (attempt: number, error: Error) => void;
     }
   ): Promise<T> {
     let lastError: Error;

     for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
       try {
         return await fn();
       } catch (error) {
         lastError = error as Error;
         if (attempt < options.maxRetries) {
           options.onRetry?.(attempt, error as Error);
           await sleep(options.backoffMs * attempt);
         }
       }
     }

     throw new AgentFriendlyError(
       `Operation failed after ${options.maxRetries} attempts`,
       `Check service health with: npm run diagnose\nReview logs: docker-compose logs`,
       { lastError: lastError.message }
     );
   }
   ```
   - Integration point: Transient failures handled automatically, persistent failures surface with diagnostics

### Step 4: Establish Consistent File Organization

Use predictable locations and naming conventions that agents can discover.

1. **Standard Directory Structure**:
   ```
   {project}/
   ├── .devcontainer/           # Development container config
   │   └── devcontainer.json
   ├── .github/
   │   └── workflows/           # CI/CD workflows
   │       ├── test.yml
   │       └── deploy.yml
   ├── knowledge/               # Knowledge base (git submodule)
   │   └── instructions/
   ├── services/                # Microservices
   │   ├── routing/
   │   ├── audit/
   │   └── knowledge/
   ├── scripts/                 # Automation scripts
   │   ├── setup.sh
   │   ├── validate.sh
   │   └── diagnose.sh
   ├── docs/                    # Documentation
   │   ├── architecture/
   │   └── api/
   ├── docker-compose.yml       # Local development
   └── package.json             # Root package config
   ```
   - Expected outcome: Agents find tools and configs without documentation

2. **Consistent Entry Points**:
   ```json
   {
     "name": "{project}",
     "scripts": {
       "setup": "scripts/setup.sh",
       "start": "docker-compose up",
       "test": "scripts/test.sh",
       "validate": "scripts/validate.sh",
       "diagnose": "scripts/diagnose.sh",
       "dev": "docker-compose up --watch",
       "logs": "docker-compose logs -f"
     }
   }
   ```
   - Rationale: Agents discover capabilities through `npm run` without docs

3. **Self-Documenting Configuration**:
   ```yaml
   # .devcontainer/devcontainer.json
   {
     "name": "{Project} Development",
     "dockerComposeFile": "../docker-compose.yml",
     "service": "devcontainer",
     "workspaceFolder": "/workspace",

     // Extensions agents benefit from
     "customizations": {
       "vscode": {
         "extensions": [
           "dbaeumer.vscode-eslint",
           "esbenp.prettier-vscode",
           "GitHub.copilot"
         ]
       }
     },

     // Automatic setup on container creation
     "postCreateCommand": "npm install && npm run setup",

     // Port forwarding for services
     "forwardPorts": [3001, 3002, 5432],

     // Environment variables with documentation
     "containerEnv": {
       "NODE_ENV": "development",
       "KNOWLEDGE_PATH": "/workspace/knowledge",
       // Add service-specific vars here
     }
   }
   ```
   - Success indicator: Dev container starts, runs setup, agent ready to work

### Step 5: Create Comprehensive Logging and Diagnostics

Implement logging that helps agents understand system state and troubleshoot issues.

1. **Structured Logging**:
   ```typescript
   import pino from 'pino';

   const logger = pino({
     level: process.env.LOG_LEVEL || 'info',
     transport: {
       target: 'pino-pretty',
       options: {
         colorize: process.env.NODE_ENV !== 'production'
       }
     }
   });

   // Usage produces parseable logs
   logger.info({
     service: 'routing',
     action: 'match_instructions',
     context: 'task creation',
     matches: 1,
     confidence: 0.95,
     durationMs: 12
   }, 'Instruction matching complete');

   // Error logging with recovery info
   logger.error({
     service: 'routing',
     action: 'load_instruction',
     file: 'missing.instructions.md',
     error: 'FILE_NOT_FOUND',
     recovery: 'Check KNOWLEDGE_PATH or create file'
   }, 'Failed to load instruction file');
   ```
   - Expected outcome: Agents parse logs to understand system behavior

2. **Health Check Endpoints**:
   ```typescript
   // services/routing/src/health.ts
   app.get('/health', async (req, res) => {
     const health = {
       status: 'healthy',
       timestamp: new Date().toISOString(),
       service: 'routing',
       version: process.env.VERSION || 'dev',
       checks: {
         database: await checkDatabase(),
         knowledgeBase: await checkKnowledgeBase(),
         dependencies: await checkDependencies()
       }
     };

     const allHealthy = Object.values(health.checks).every(c => c.status === 'ok');
     res.status(allHealthy ? 200 : 503).json(health);
   });

   async function checkKnowledgeBase() {
     try {
       const instructionFiles = await listInstructionFiles();
       return {
         status: 'ok',
         instructionCount: instructionFiles.length,
         lastScanned: new Date().toISOString()
       };
     } catch (error) {
       return {
         status: 'error',
         error: error.message,
         action: 'Check KNOWLEDGE_PATH and file permissions'
       };
     }
   }
   ```
   - Integration point: Agents query health endpoints to validate service readiness

3. **Comprehensive Error Context**:
   ```typescript
   // Capture full context on errors
   try {
     const result = await routingService.match(request);
   } catch (error) {
     logger.error({
       service: 'routing',
       operation: 'match_instructions',
       request: {
         context: request.context,
         filePatterns: request.filePatterns
       },
       environment: {
         knowledgePath: config.knowledge.basePath,
         nodeEnv: process.env.NODE_ENV
       },
       error: {
         message: error.message,
         stack: error.stack,
         name: error.name
       },
       timestamp: new Date().toISOString()
     }, 'Routing operation failed');
     throw error;
   }
   ```
   - Success indicator: Error logs contain all information needed for diagnosis

## Examples

### Example 1: Zero-Configuration Routing Service Setup

**Context**: Agent needs to run routing service locally to test instruction matching

**Scenario**: Agent clones repo and needs working environment immediately

```bash
# Agent executes these commands, nothing else needed
git clone https://github.com/{owner}/{repo}.git
cd {project}
docker-compose up

# Output shows services starting with defaults:
# ✓ routing-service started on port 3001
# ✓ audit-service started on port 3002
# ✓ postgres initialized with schema
# ✓ Knowledge base mounted from ./knowledge

# Agent can immediately test
curl http://localhost:3001/health
# {
#   "status": "healthy",
#   "checks": {
#     "database": {"status": "ok"},
#     "knowledgeBase": {"status": "ok", "instructionCount": 8}
#   }
# }

curl -X POST http://localhost:3001/api/route \
  -H "Content-Type: application/json" \
  -d '{"context": "task creation"}'
# {
#   "matches": [{
#     "file": "task_creation_workflow.instructions.md",
#     "confidence": 0.95,
#     "reason": "Context match + priority P0"
#   }]
# }
```

**Expected Result**: Working environment in under 2 minutes, zero manual configuration

### Example 2: Structured Tool Output for Validation

**Context**: Agent validates instruction files before committing changes

**Scenario**: Agent runs validation script and needs to parse results programmatically

```bash
# Agent runs validation with JSON output
npm run validate -- --format json > results.json

# results.json contains structured output
cat results.json
```

```json
{
  "timestamp": "2025-10-27T12:00:00Z",
  "command": "validate-instructions",
  "version": "0.1.0",
  "results": [
    {
      "file": "task_creation_workflow.instructions.md",
      "status": "ok",
      "checks": {
        "frontmatter": {"status": "ok", "fields": ["title", "description", "applies_to"]},
        "structure": {"status": "ok", "sections": ["When to Apply", "Core Principles", "Examples"]},
        "links": {"status": "ok", "broken": []}
      }
    },
    {
      "file": "broken_example.instructions.md",
      "status": "error",
      "checks": {
        "frontmatter": {"status": "error", "message": "Missing 'priority' field"},
        "structure": {"status": "ok"},
        "links": {"status": "error", "broken": ["./missing_file.md"]}
      },
      "action": "Add 'priority' field to frontmatter\nFix broken link: ./missing_file.md"
    }
  ],
  "summary": {
    "total": 8,
    "passed": 7,
    "failed": 1
  },
  "exit_code": 1
}
```

**Agent Decision Logic**:
```typescript
const results = JSON.parse(fs.readFileSync('results.json', 'utf-8'));

if (results.exit_code !== 0) {
  const failures = results.results.filter(r => r.status === 'error');
  for (const failure of failures) {
    console.log(`Fix required for ${failure.file}:`);
    console.log(failure.action);
  }
  process.exit(1);
}
```

**Expected Result**: Agent parses structured output, understands failures, knows exact fixes needed

**Trade-offs**: More complex output format, but enables programmatic decision-making

### Example 3: Graceful Failure with Recovery Steps

**Context**: Routing service can't find knowledge base on startup

**Scenario**: Environment misconfiguration, agent needs clear recovery path

```typescript
// Service startup validation
const startupValidation = validateEnvironment();

if (!startupValidation.valid) {
  logger.error({
    service: 'routing',
    phase: 'startup',
    validation: startupValidation
  }, 'Environment validation failed');

  // Output structured error for agents
  console.error(JSON.stringify({
    error: 'ENVIRONMENT_VALIDATION_FAILED',
    details: startupValidation.errors,
    actions: startupValidation.errors.map(e => e.action),
    diagnostic_command: 'npm run diagnose',
    timestamp: new Date().toISOString()
  }, null, 2));

  process.exit(1);
}

// Output when validation fails:
{
  "error": "ENVIRONMENT_VALIDATION_FAILED",
  "details": [
    "Instructions path not found: ./knowledge/instructions"
  ],
  "actions": [
    "Run 'npm run setup' to clone knowledge submodule",
    "Or set INSTRUCTIONS_PATH environment variable to correct location",
    "Or check that knowledge submodule is initialized: git submodule update --init"
  ],
  "diagnostic_command": "npm run diagnose",
  "timestamp": "2025-10-27T12:00:00Z"
}
```

**Agent Recovery Process**:
```bash
# Agent sees error, executes suggested action
npm run setup

# Or runs diagnostic for more info
npm run diagnose

# Diagnostic output guides resolution:
# ✗ Knowledge base not found
#   Current path: ./knowledge
#   Expected: ./knowledge/instructions
#   Action: git submodule update --init
#   Or: export KNOWLEDGE_PATH=/path/to/knowledge
```

**Expected Result**: Agent resolves issue without human intervention using provided recovery steps

## Validation Checklist

Complete before marking agent environment setup as done:

### Zero-Configuration Bootstrap
- [ ] Docker Compose brings up all services with no env vars required
- [ ] All services have sensible defaults for development
- [ ] Devcontainer/Codespace works immediately after creation
- [ ] Setup script automates any required initialization
- [ ] Health checks verify environment is ready

### Structured Output
- [ ] All CLI tools support `--format json` option
- [ ] JSON output includes metadata (timestamp, version, exit_code)
- [ ] Error output includes structured recovery actions
- [ ] Logs use structured format (JSON, pino, etc.)
- [ ] Health endpoints return structured status

### Graceful Failures
- [ ] All errors include actionable recovery steps
- [ ] Diagnostic command available (npm run diagnose)
- [ ] Retries implemented for transient failures
- [ ] Error messages include context (env vars, file paths, etc.)
- [ ] Exit codes follow conventions (0=success, 1=error, 2=misuse)

### Consistent Interfaces
- [ ] Standard directory structure documented and followed
- [ ] Entry points accessible via npm scripts
- [ ] File locations predictable (configs in root, scripts in scripts/, etc.)
- [ ] Naming conventions consistent across services
- [ ] Documentation co-located with code

## Common Pitfalls

### Pitfall 1: Manual Configuration Required

- ❌ **Problem**: Services require manual setup steps (database init, env vars, etc.) before working
- **Why it happens**: Assuming human-driven setup, not designing for automation
- ✅ **Solution**: Provide defaults for everything, automate initialization in docker-compose/devcontainer
- **Example**: Requiring agent to manually create `.env` file instead of providing defaults with override capability

### Pitfall 2: Unstructured Tool Output

- ❌ **Problem**: Tools output human-readable text that agents can't parse reliably
- **Why it happens**: Designing for human users, forgetting agent consumption
- ✅ **Solution**: Support both human and JSON output modes, default to human
- **Example**: Validation script outputs colored text instead of JSON with structured results

### Pitfall 3: Cryptic Error Messages

- ❌ **Problem**: Errors say "Failed to connect to database" without context or recovery steps
- **Why it happens**: Traditional error handling focused on describing problem, not solving it
- ✅ **Solution**: Include context (what, why, how to fix) in every error
- **Example**: "Database connection failed" vs "Database connection failed: postgres:5432 unreachable. Action: Check docker-compose ps, ensure postgres service is running"

### Pitfall 4: Inconsistent File Locations

- ❌ **Problem**: Configs scattered across repo, scripts in random locations, no conventions
- **Why it happens**: Organic growth without structure
- ✅ **Solution**: Establish directory structure, document conventions, enforce in CI
- **Example**: Scripts in `./bin/`, `./tools/`, `./.scripts/` instead of consistent `./scripts/`

### Pitfall 5: Missing Diagnostics

- ❌ **Problem**: When things fail, agent has no way to understand system state
- **Why it happens**: Assuming developers will just "figure it out"
- ✅ **Solution**: Provide diagnostic command that outputs comprehensive system state
- **Example**: Service fails to start with no logs vs detailed health check showing database unreachable, knowledge path not found

## Edge Cases

### Edge Case 1: Production vs Development Configuration

**When**: Defaults work for development, but production needs different values

**Approach**:
- Development defaults in code (safe, convenient)
- Production requires explicit environment variables
- Validate on startup: if NODE_ENV=production and using dev defaults, error
- Document production requirements in deployment guide

**Example**: DB password defaults to "devpass" for local dev, but startup validation fails if production env detected

### Edge Case 2: Platform-Specific Behavior

**When**: Tool behaves differently on macOS, Linux, Windows

**Approach**:
- Use Docker for consistency where possible
- Abstract platform differences behind npm scripts
- Document platform requirements clearly
- Provide platform-specific diagnostics

**Example**: File path separators, line endings, Docker Desktop vs Docker Engine - handle transparently

### Edge Case 3: Slow or Unreliable External Dependencies

**When**: GitHub API rate limits, network timeouts, service unavailability

**Approach**:
- Implement retries with exponential backoff
- Provide offline mode/mocks for development
- Cache responses when appropriate
- Clear error messages about external dependency failures

**Example**: GitHub MCP integration times out - retry 3x, then fail with clear message about rate limiting

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Service won't start | Missing environment configuration | Run `npm run diagnose`, check output for missing vars |
| Docker Compose fails | Port conflicts or resource limits | Check `docker ps` for conflicts, adjust ports in docker-compose.yml |
| Knowledge base not found | Git submodule not initialized | Run `git submodule update --init` or `npm run setup` |
| Tests fail in CI but pass locally | Environment differences | Use same Docker image locally and in CI, check for hardcoded paths |
| Tool output unreadable by agent | Human-readable format | Add `--format json` flag support to all tools |
| Health check always fails | Unrealistic timeout or missing dependency | Increase timeout, fix dependency, or remove check |

## Related Instructions

- **See also**: [agentic_decision_making.instructions.md](./agentic_decision_making.instructions.md) - How agents use environment setup for context-first decisions
- **Prerequisites**: [instruction_file_creation.instructions.md](../documentation/instruction_file_creation.instructions.md) - Creating discoverable instructions agents can find
- **See also**: [deterministic_validation_framework.instructions.md](../validation/deterministic_validation_framework.instructions.md) - Testing environment setup deterministically

---

**Success Criteria**: Agents can clone repo, run `docker-compose up`, and have fully functional development environment within 2 minutes. All tools produce structured output agents can parse. All failures include actionable recovery steps.

**Confidence Check**: Can an agent start working without reading documentation? Do tools produce JSON output for parsing? Do errors tell agents exactly what to do?
