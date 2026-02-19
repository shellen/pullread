---
pongogo_instruction_spec: "0.0.2"
title: "Validation Essentials"
description: "Essential validation patterns, requirements, and quality gates."
applies_to:
  - "**/*"
domains:
  - "validation"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - validation_essentials
      - quality_gates
      - 100%_pass_rate
      - deterministic_validation
      - production_success
      - completion_criteria
      - verification_efficiency
      - flaky_tests
      - epic_validation
      - operational_validation
    nlp: "Essential validation standards with quality gates, 100% pass rate in controlled environments, 95% production success, verification efficiency, deterministic testing"
evaluation:
  success_signals:
    - "Controlled environment tests achieve 100% pass rate"
    - "Production workflows maintain 95%+ success rate"
    - Verification efficiency protocol followed (max 2-3 checks)
    - Quality gates enforced before completion
  failure_signals:
    - "Tests pass at less than 100% in controlled environment"
    - Flaky tests accepted instead of fixed
    - Endless re-verification exceeding budget
    - Friction signals ignored during execution
---


# Validation Essentials

**Purpose**: Establish essential validation standards ensuring quality gates, testing protocols, and completion criteria maintain the integrity of agent-first architecture.

**Philosophy**: Deterministic validation with 100% pass rates in controlled environments is non-negotiable for agentic systems where agents must make reliable, repeatable decisions.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Implementing quality gates for any service (API, CLI, MCP server)
- **Scenario 2**: Designing test suites for microservices or integration workflows
- **Scenario 3**: Validating completion of Epics, Tasks, or deployment phases
- **Scenario 4**: Creating CI/CD pipelines with automated validation steps
- **Scenario 5**: Defining acceptance criteria for feature development

---

## Quick Reference

**Key Validation Standards**:

**1. Pass Rate Thresholds** (Critical Distinction):
- **Controlled Test Environment**: 100% pass rate required (zero tolerance for flaky tests)
- **Production Workflows**: 95% minimum success rate under normal conditions
- **Critical Services**: May require 99%+ success rate for high-impact paths

**2. Deterministic Test Checklist**:
- [ ] Uses fixed, predictable inputs (no `Date.now()`, `Math.random()`)
- [ ] External dependencies mocked with deterministic responses
- [ ] Each test isolates its state (database reset, no shared globals)
- [ ] Same test run multiple times produces identical results
- [ ] Tests run offline without external service dependencies

**3. Verification Efficiency Protocol**:
- **First verification**: Perform full validation and document result
- **Second verification**: Confirm previous result if state may have changed
- **Third verification**: Final check before critical operation
- **After 3rd verification**: Trust documented verification, do not re-check
- **Rationale**: Scales linearly O(N), not quadratically O(N²)

**4. Quality Gate Decision Points**:
```
Can Epic/Task be marked complete?
├─ Operational validation 100% pass? NO → FIX tests, BLOCK completion
├─ Operational validation 100% pass? YES
   ├─ Production success ≥ 95%? NO → Investigate, BLOCK completion
   ├─ Production success ≥ 95%? YES
      ├─ Dependencies verified ≥ 95%? NO → Verify dependencies
      ├─ Dependencies verified ≥ 95%? YES
         ├─ Integration tests 100% pass? NO → Fix integration tests
         └─ Integration tests 100% pass? YES → ✅ READY for completion
```

**5. Completion Validation Requirements** (All must pass):
- **Operational Validation**: 100% pass rate on all operational tests
- **Dependency Verification**: All dependencies confirmed operational (95%+ success)
- **Integration Testing**: All agentic integration points validated (100% pass)
- **Systematic Prevention**: All identified failure modes addressed

**6. When to Block Deployment** (Non-negotiable):
- Controlled test environment shows < 100% pass rate
- Production success rate < 95% over observation period
- Flaky tests detected (intermittent failures)
- Dependencies not verified operational
- Rollback procedure not tested

**7. User Expectation Validation** (NEW - Routing IMP-018):

Friction signals often indicate validation gaps where implementation diverged from user expectations:

**Friction Signals → Validation Gaps**:
| Friction Signal | What It Reveals | Validation Action |
|-----------------|-----------------|-------------------|
| "that's not what I expected" | Output validation missing | Add expected output check |
| "you skipped the tests" | Sequence validation missing | Add prerequisite gate |
| "wait, I wanted to review first" | Approval gate missing | Add user confirmation step |
| "we already discussed this" | Context validation missing | Verify understanding before proceeding |

**Expectation Validation Protocol**:
1. **Before execution**: Confirm understanding of expected outcome
2. **During execution**: Check for friction signals (pause if detected)
3. **After completion**: Verify output matches expectation (not just "works")

**Why This Matters**:
- Technical validation (code works) ≠ Expectation validation (output matches intent)
- Friction signals are real-time feedback that expectation validation failed
- Capturing friction patterns improves future validation criteria

---

## Core Principles

- **100% Pass Rate Standard**: All validation tests must achieve 100% pass rates in controlled test environments - no exceptions for core operational validation
- **Deterministic Validation Required**: Validation must be deterministic and repeatable; same inputs always produce same outputs in controlled environments
- **Verification Efficiency**: Maximum 2-3 verifications of the same information per task; after limit reached, trust previous verification
- **Production Success Threshold**: Minimum 95% success rate for production workflows under normal conditions
- **Binary Outcomes Only**: Clear pass/fail criteria with no statistical ambiguity or probabilistic signals

## Step-by-Step Guidance

1. **Define Validation Scope**
   - Identify what needs validation (service endpoint, integration workflow, feature completion)
   - Determine test environment requirements (isolated, controlled, production-like)
   - Expected outcome: Clear validation boundaries with explicit test conditions

2. **Design Deterministic Tests**
   - Create predictable inputs with known expected outputs
   - Ensure repeatable results independent of external factors
   - Rationale: Agents require reliable, binary pass/fail signals for decision-making
   - Success indicator: Same test run multiple times produces identical results

3. **Implement Quality Gates**
   - Establish 100% pass rate requirement for controlled environments
   - Set 95% minimum success threshold for production workflows
   - Common variation: Service-specific thresholds may be higher (99%+) for critical paths
   - Integration point: CI/CD pipeline enforces quality gates before deployment

4. **Apply Verification Efficiency**
   - Limit re-verification to 2-3 checks per task or validation point
   - Document verification status in summaries or handoff notes
   - Success indicator: Validation time scales linearly (O(N)), not quadratically (O(N²))

5. **Validate Completion Criteria**
   - Operational validation: 100% pass rate on all operational tests
   - Dependency verification: All workflow dependencies confirmed operational (95%+ success)
   - Integration testing: All agentic integration points validated (100% pass)
   - Systematic prevention: All identified failure modes addressed

## Examples

### Example 1: MCP Server Endpoint Validation

```bash
# Deterministic test for MCP server health endpoint
# Expected: 200 OK with valid JSON response containing status field

# Test script: tests/mcp_server/health_check.test.ts
describe('MCP Server Health Endpoint', () => {
  test('returns 200 OK with valid status JSON', async () => {
    const response = await fetch('http://localhost:3000/health');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(['healthy', 'degraded']).toContain(data.status);
  });
});

# CI/CD validation gate
# Must pass 100% in test environment before deployment
npm test -- tests/mcp_server/health_check.test.ts
```

**Context**: MCP server health checks enable agents to verify service availability before routing decisions. Deterministic validation ensures agents receive reliable signals.

**Expected Result**: Test passes 100% of the time in controlled environment; any failure indicates service configuration issue requiring immediate investigation.

### Example 2: Agent Routing Service Integration Test

```typescript
// tests/integration/agent_routing.test.ts
// Validates agent instruction routing based on file patterns

import { RoutingService } from '{package}/routing';
import { InstructionRegistry } from '{package}/knowledge';

describe('Agent Routing Service Integration', () => {
  let routingService: RoutingService;
  let registry: InstructionRegistry;

  beforeEach(() => {
    // Controlled test environment with fixed instruction set
    registry = new InstructionRegistry('./fixtures/instructions');
    routingService = new RoutingService(registry);
  });

  test('routes GitHub workflow files to github_integration instructions', async () => {
    const filePath = '.github/workflows/ci.yml';
    const instructions = await routingService.getInstructionsFor(filePath);

    // Deterministic expectation: GitHub files always match github_integration domain
    expect(instructions).toContainEqual(
      expect.objectContaining({ domain: 'github_integration' })
    );
  });

  test('routes validation scripts to validation domain instructions', async () => {
    const filePath = 'scripts/validate-deployment.sh';
    const instructions = await routingService.getInstructionsFor(filePath);

    expect(instructions).toContainEqual(
      expect.objectContaining({ domain: 'validation' })
    );
  });
});
```

**Context**: Routing service is critical infrastructure enabling agent-first architecture. 100% pass rate ensures agents always receive correct contextual guidance.

**Trade-offs**: Deterministic tests require fixture data, which must be maintained. Trade-off accepted because routing reliability is foundational.

### Example 3: Epic Completion Validation Checklist

```markdown
## Epic Validation Checklist - [Epic]-api_gateway

**Quality Gates - ALL must pass before Epic completion:**

- [x] **Operational Validation**: 100% pass rate on all operational tests (12/12 tests passing)
  - Gateway health check: PASS
  - Authentication middleware: PASS
  - Rate limiting: PASS
  - Request routing: PASS
  - Error handling: PASS
  - Logging integration: PASS
  - (6 additional tests: all PASS)

- [x] **Dependency Verification**: All workflow dependencies operational (98.3% success over 7 days)
  - Auth service availability: 99.1%
  - Database connection pool: 99.8%
  - Redis cache: 97.2%
  - (Minimum 95% threshold: MET)

- [x] **Integration Testing**: All agentic integration points validated (100% pass)
  - MCP server discovery: PASS
  - CLI command integration: PASS
  - Agent request routing: PASS

- [x] **Systematic Prevention**: All identified failure modes addressed
  - Circuit breaker for downstream failures: IMPLEMENTED
  - Graceful degradation for cache outages: IMPLEMENTED
  - Rollback procedure verified: TESTED

**Epic Status**: ✅ READY FOR COMPLETION
```

**Context**: Epic validation ensures work is not just deployed but operational and effective. Checklist provides clear binary gates for agents and humans.

**Expected Result**: Epic closure only occurs when all checkboxes pass; any failure blocks completion and triggers remediation workflow.

## Validation Checklist

- [ ] All validation tests designed with deterministic, predictable inputs and expected outputs
- [ ] Controlled test environment achieves 100% pass rate (zero tolerance for flaky tests)
- [ ] Production workflows monitored for 95%+ success rate under normal conditions
- [ ] Verification efficiency maintained (max 2-3 checks per validation point)
- [ ] Quality gates enforced in CI/CD pipeline before deployment
- [ ] Completion criteria includes operational validation, dependency verification, and integration testing
- [ ] All test failures trigger root cause analysis and systematic prevention implementation
- [ ] Rollback procedures verified operational before Epic/Task completion

## Common Pitfalls

### Pitfall 1: Statistical Validation in Controlled Environments

- ❌ **Problem**: Using "95% success over 20 runs" as acceptance criteria introduces statistical variance making it unreliable for agent decision-making
- **Why it happens**: Developers confuse production success rate monitoring (95%+ acceptable) with controlled test validation (100% required)
- ✅ **Solution**: Use deterministic functional correctness validation in controlled environments; reserve statistical monitoring for production observability
- **Example**: Test "authentication endpoint returns 200 OK for valid credentials" should pass 100% in controlled environment, not 95%

### Pitfall 2: Endless Re-Verification

- ❌ **Problem**: Reading the same configuration file 5+ times, checking the same prerequisite repeatedly, re-validating already confirmed states
- **Why it happens**: Lack of trust in previous verification results or unclear verification status tracking
- ✅ **Solution**: Document verification status explicitly; trust documented verification after 2-3 checks; implement verification efficiency protocol
- **Example**: After confirming Docker service is running 2 times, trust that status and proceed; don't check again unless there's evidence of state change

### Pitfall 3: Incomplete Completion Criteria

- ❌ **Problem**: Declaring work "done" without running validation test suite or verifying quality gates pass
- **Why it happens**: Pressure to complete tasks quickly or misunderstanding of "done" definition
- ✅ **Solution**: All quality gates must pass before completion; use Epic Validation Standards checklist as mandatory gate
- **Example**: Feature implementation complete but not validated is NOT done; validation must show 100% pass in controlled environment

### Pitfall 4: Ignoring Friction Signals (Routing IMP-018)

- ❌ **Problem**: Continuing execution when user expresses "wait", "that's not what I", "you're skipping" signals
- **Why it happens**: Focus on technical validation while missing expectation validation
- ✅ **Solution**: Treat friction signals as real-time validation failures; PAUSE immediately, clarify, resume correctly
- **Example**: User says "wait, I wanted to review first" → STOP → This signals missing approval gate → Add confirmation step

## Edge Cases

### Edge Case 1: Service Degradation in Production

**When**: Production success rate drops below 95% threshold but controlled environment tests still pass at 100%

**Approach**:
1. Confirm controlled tests still pass (validates core logic is sound)
2. Investigate production-specific factors (load, dependencies, network)
3. Implement production-specific fixes (caching, circuit breakers, rate limiting)
4. Monitor recovery to 95%+ threshold before resuming feature work

**Example**: API gateway shows 89% production success but all unit tests pass. Investigation reveals downstream service timeout under load. Solution: Add circuit breaker and increase timeout for that dependency.

### Edge Case 2: Flaky Tests in CI/CD

**When**: Tests pass locally at 100% but fail intermittently (< 100%) in CI/CD pipeline

**Approach**:
1. DO NOT lower pass rate threshold or ignore flaky tests
2. Investigate root cause: timing issues, environmental differences, resource constraints
3. Fix test or environment to achieve 100% pass rate
4. If test design is flawed, redesign test to be deterministic

**Example**: Integration test fails 10% of the time in CI due to race condition. Solution: Add proper wait conditions or synchronization, not "rerun until it passes."

### Edge Case 3: Third-Party Dependency Failures

**When**: Validation depends on external service (GitHub API, cloud provider) outside direct control

**Approach**:
1. Separate internal validation (100% pass required) from external dependency checks
2. Use mocking/stubbing for external dependencies in controlled tests
3. Monitor external dependency success rates separately (95%+ acceptable)
4. Implement graceful degradation for external failures

**Example**: GitHub API rate limiting affects validation. Solution: Mock GitHub API for controlled tests (100% pass), monitor real API separately (95%+ acceptable).

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Tests pass locally but fail in CI | Environmental differences (timing, resources, configuration) | Investigate CI environment; fix test to be environment-independent or normalize CI setup |
| Validation takes too long (> 10 minutes) | Excessive re-verification or redundant checks | Apply verification efficiency protocol; document verification status; trust previous checks |
| Production success rate < 95% but tests pass | Production-specific load, dependencies, or environmental factors | Investigate production conditions; implement production-specific mitigations (caching, circuit breakers) |
| Flaky tests (< 100% pass rate) | Non-deterministic test design (race conditions, timing dependencies) | Redesign test for determinism; add proper synchronization; fix test environment |
| Quality gates ignored/bypassed | Unclear enforcement or missing CI/CD integration | Integrate quality gates into CI/CD pipeline as mandatory checks; block deployment on failure |
| Agents make incorrect routing decisions | Validation passed but doesn't cover agent decision logic | Add integration tests validating agent-facing APIs; ensure agent decision paths are tested |

## Related Instructions

- **See also**: [Deterministic Validation Framework](./deterministic_validation_framework.instructions.md) - Comprehensive framework for designing deterministic validation systems
- **See also**: [Verification Efficiency](./verification_efficiency.instructions.md) - Detailed protocol for avoiding endless re-verification
- **See also**: [Epic Validation Standards](./epic_validation_standards.instructions.md) - Complete Epic completion criteria and quality gates
- **See also**: [Project Glossary](../../wiki/Project-Glossary.md) - Authoritative source for PM terminology (Epic, Task, Sub-Task, Sub-Issue)
- **See also**: [Glossary Maintenance](../project_management/glossary_maintenance.instructions.md) - Keeping glossary current and complete
- **Prerequisites**: [Development Workflow Essentials](../trust_execution/development_workflow_essentials.instructions.md) - Understanding of Epic/Task structure before applying validation
- **Next steps**: [Quality Gate Compliance](./quality_gate_compliance.instructions.md) - Advanced quality gate implementation patterns

---

**Success Criteria**: Validation tests achieve 100% pass rate in controlled environments, production workflows maintain 95%+ success rate, quality gates enforced in CI/CD, and Epic/Task completion requires passing all validation criteria.

**Confidence Check**: Can you articulate the difference between 100% pass rate in controlled environments vs. 95% success rate in production? Do your validation tests produce deterministic, repeatable results?
