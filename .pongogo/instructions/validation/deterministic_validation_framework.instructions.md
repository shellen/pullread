---
pongogo_instruction_spec: "0.0.2"
title: "Deterministic Validation Framework"
description: "Deterministic validation framework for consistent, reproducible verification results."
applies_to:
  - "**/*"
domains:
  - "validation"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 0
  triggers:
    keywords:
      - deterministic_validation
      - 100%_pass_rate
      - flaky_tests
      - deterministic_tests
      - mocked_dependencies
      - binary_signals
      - statistical_validation
      - test_isolation
      - predictable_inputs
      - controlled_environment
    nlp: "Deterministic validation framework requiring 100% pass rate in controlled environments, eliminating flaky tests, mocking dependencies for binary pass/fail signals"
evaluation:
  success_signals:
    - Test suite passes 10+ consecutive runs with identical results
    - "No statistical assertions (no 95% success rate thresholds)"
    - All external dependencies mocked with deterministic responses
    - Fixed test data used (no Date.now, Math.random in tests)
    - Binary pass/fail results (unambiguous for agent decision-making)
  failure_signals:
    - Test accepts statistical success rate (passes 19/20 times)
    - Time-dependent test logic without mocking Date.now
    - Tests interfere with each other (shared state not reset)
    - Flaky tests tolerated (re-running CI until tests pass)
    - Missing error path tests (only happy path covered)
---


# Deterministic Validation Framework

**Purpose**: Ensure all validation in agentic systems produces deterministic, repeatable results with 100% pass rate requirement in controlled environments.

**Philosophy**: Agents require binary pass/fail signals, not probabilistic thresholds - statistical validation introduces unacceptable variance for automated decision-making.

---

## When to Apply

Use this framework when:

- Writing tests for services (routing service, audit service, knowledge system)
- Designing CI/CD validation pipelines for automated deployments
- Creating validation scripts for agent-driven workflows
- Implementing quality gates in the trust-based execution model
- Evaluating whether existing tests meet agentic reliability standards

---

## Quick Reference

**Most Common Deterministic Test Patterns**:

**1. Statistical → Deterministic Transformation**:
```typescript
// ❌ Statistical validation - introduces variance
describe('Routing Service', () => {
  it('should have 95% success rate over 20 runs', async () => {
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      if (await routeRequest(testInput)) successes++;
    }
    expect(successes / 20).toBeGreaterThanOrEqual(0.95); // PROBABILISTIC
  });
});

// ✅ Deterministic validation - eliminates variance
describe('Routing Service', () => {
  it('should route request correctly with known input', async () => {
    const result = await routeRequest({
      context: 'task creation',
      patterns: ['project_management']
    });
    expect(result.instructionFile).toBe('task_creation_workflow.instructions.md');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

**2. Fixed Test Data (No Randomness)**:
```typescript
// ❌ Non-deterministic - changes every test run
const testTimestamp = Date.now();
const testId = Math.random().toString();

// ✅ Deterministic - same every test run
const testTimestamp = new Date('2025-10-27T12:00:00Z').getTime();
const testId = 'test-routing-request-001';
```

**3. Mock External Dependencies**:
```typescript
// ✅ Deterministic responses from mocked services
beforeEach(() => {
  mockGitHubAPI({
    'GET /repos/{owner}/{repo}/issues/42': {
      status: 200,
      body: { title: 'Task: Known Test Issue', state: 'open' }
    }
  });
});

test('should fetch issue correctly', async () => {
  const issue = await fetchIssue(42);
  expect(issue.title).toBe('Task: Known Test Issue'); // Always this result
});
```

**4. Isolated Database State**:
```typescript
// ✅ Each test gets fresh, isolated database state
beforeEach(async () => {
  await resetTestDatabase();
  await seedTestData(FIXED_TEST_DATASET);
});

afterEach(async () => {
  await cleanupTestDatabase();
});
```

**5. Flaky Test Detection**:
```bash
# Run test suite multiple times to detect flakiness
for i in {1..10}; do
  npm test 2>&1 | tee "test-run-$i.log"
done

# Analyze for inconsistent results
diff test-run-1.log test-run-10.log
```

---

## Core Principles

- **100% Pass Rate Required**: No statistical variance acceptable in controlled environments - tests either pass or fail deterministically
- **Eliminate Flaky Tests**: Fix or remove tests with intermittent failures - no "usually works" tolerance
- **Predictable Inputs**: Use known test data with expected outcomes, never randomized or time-dependent values
- **Controlled Environment**: Isolate test conditions from external variables that introduce non-determinism
- **Clear Binary Signals**: Every validation produces unambiguous pass/fail result that agents can parse programmatically

## Step-by-Step Guidance

### Step 1: Replace Statistical Validation with Functional Validation

Move from probability-based success rates to deterministic correctness testing.

1. **Identify Statistical Tests**:
   - Look for tests checking success rate thresholds (≥95%, ≥99%, etc.)
   - Find tests with "acceptable failure" tolerances
   - Locate tests using probabilistic assertions
   - Expected outcome: List of tests requiring replacement

2. **Design Functional Correctness Tests**:
   ```typescript
   // ❌ Statistical validation - introduces variance
   describe('Routing Service', () => {
     it('should have 95% success rate over 20 runs', async () => {
       let successes = 0;
       for (let i = 0; i < 20; i++) {
         if (await routeRequest(testInput)) successes++;
       }
       expect(successes / 20).toBeGreaterThanOrEqual(0.95); // PROBABILISTIC
     });
   });

   // ✅ Deterministic validation - eliminates variance
   describe('Routing Service', () => {
     it('should route request correctly with known input', async () => {
       const result = await routeRequest({
         context: 'task creation',
         patterns: ['project_management', 'github_integration']
       });
       expect(result.instructionFile).toBe('task_creation_workflow.instructions.md');
       expect(result.confidence).toBeGreaterThan(0.8);
       // Exact expected output every time
     });
   });
   ```
   - Rationale: Deterministic tests reveal actual bugs, statistical tests mask intermittent failures

3. **Implement 100% Pass Requirement**:
   - Every test must pass every run in controlled environment
   - No tolerance for flaky tests
   - Success indicator: Test suite produces identical results across multiple runs

### Step 2: Design Tests with Predictable Inputs

Create test data that produces consistent, expected outcomes.

1. **Use Fixed Test Data**:
   ```typescript
   // ❌ Non-deterministic - changes every test run
   const testTimestamp = Date.now();
   const testId = Math.random().toString();

   // ✅ Deterministic - same every test run
   const testTimestamp = new Date('2025-10-27T12:00:00Z').getTime();
   const testId = 'test-routing-request-001';
   ```
   - Expected outcome: Test data identical across all runs

2. **Mock External Dependencies**:
   ```typescript
   // ✅ Mock GitHub API for deterministic responses
   beforeEach(() => {
     mockGitHubAPI({
       'GET /repos/{owner}/{repo}/issues/42': {
         status: 200,
         body: { title: 'Task: Known Test Issue', state: 'open' }
       }
     });
   });

   test('should fetch issue correctly', async () => {
     const issue = await fetchIssue(42);
     expect(issue.title).toBe('Task: Known Test Issue'); // Always this result
   });
   ```
   - Integration point: Isolates tests from external service variability

3. **Avoid Time-Dependent Logic**:
   - Mock `Date.now()`, `new Date()` in tests
   - Use fixed timestamps for time-based validations
   - Control async timing with deterministic delays
   - Success indicator: Tests produce same results regardless of when executed

### Step 3: Implement Comprehensive Error Handling Tests

Validate that workflows handle expected error conditions gracefully.

1. **Test Each Error Path**:
   ```typescript
   describe('Routing Service Error Handling', () => {
     it('should handle missing instruction file gracefully', async () => {
       const result = await routeRequest({
         context: 'nonexistent_domain'
       });
       expect(result.error).toBe('NO_MATCHING_INSTRUCTION');
       expect(result.fallback).toBe('_template.instructions.md');
       expect(result.confidence).toBe(0); // Clear failure signal
     });

     it('should handle API timeout gracefully', async () => {
       mockAPITimeout();
       const result = await routeRequest({ context: 'test' });
       expect(result.error).toBe('API_TIMEOUT');
       expect(result.retryable).toBe(true);
     });
   });
   ```
   - Expected outcome: All error conditions tested and handled deterministically

2. **Validate Graceful Degradation**:
   - Test fallback behavior when primary path fails
   - Verify system remains operational with reduced functionality
   - Ensure error messages are actionable
   - Rationale: Agents need predictable failure modes for decision-making

### Step 4: Create Controlled Test Environments

Isolate test execution from non-deterministic factors.

1. **Database Isolation**:
   ```typescript
   // ✅ Each test gets fresh, isolated database state
   beforeEach(async () => {
     await resetTestDatabase();
     await seedTestData(FIXED_TEST_DATASET);
   });

   afterEach(async () => {
     await cleanupTestDatabase();
   });
   ```
   - Expected outcome: No test pollution, each test starts with known state

2. **Service Dependency Mocking**:
   - Mock external services (GitHub API, MCP server, etc.)
   - Use in-memory implementations for databases
   - Control network conditions (no real HTTP calls in unit tests)
   - Success indicator: Tests run offline without external dependencies

3. **Resource Allocation Control**:
   - Allocate sufficient resources for test execution
   - Prevent resource contention between parallel tests
   - Monitor for resource exhaustion during test runs
   - Integration point: CI/CD pipeline provisions adequate resources

### Step 5: Implement Operational Reliability Testing

Test that services function correctly under expected operational conditions.

1. **Dependency Availability Tests**:
   ```typescript
   describe('Service Dependencies', () => {
     it('should verify routing service can access instruction files', async () => {
       const instructionFile = await loadInstruction('task_creation_workflow');
       expect(instructionFile).toBeDefined();
       expect(instructionFile.frontmatter.title).toBeDefined();
     });

     it('should verify audit service can write to event store', async () => {
       const event = { type: 'ROUTING_DECISION', timestamp: FIXED_TIME };
       const result = await auditService.logEvent(event);
       expect(result.success).toBe(true);
       expect(result.eventId).toMatch(/^evt-/);
     });
   });
   ```
   - Expected outcome: All required dependencies validated as operational

2. **Permission Validation Tests**:
   - Test that service accounts have required permissions
   - Verify API tokens are valid and not expired
   - Validate file system access permissions
   - Success indicator: Permissions verified before deployment

3. **Integration Point Tests**:
   - Test cross-service communication (routing → audit logging)
   - Validate message queue functionality
   - Verify event emission and consumption
   - Rationale: Prevents integration failures in production

### Step 6: Fix or Remove Flaky Tests

Systematically eliminate non-deterministic test behavior.

1. **Identify Flaky Tests**:
   ```bash
   # Run test suite multiple times to detect flakiness
   for i in {1..10}; do
     npm test 2>&1 | tee "test-run-$i.log"
   done

   # Analyze for inconsistent results
   diff test-run-1.log test-run-10.log
   ```
   - Expected outcome: List of tests with inconsistent results

2. **Root Cause Analysis**:
   - Race conditions in async code
   - Uncontrolled timing dependencies
   - External service dependencies
   - Shared state between tests
   - Common variation: Check for missing `await` keywords, improper mocking

3. **Fix or Remove**:
   - **Fix**: Address root cause (add proper mocking, fix race conditions, isolate state)
   - **Remove**: Delete test if it cannot be made deterministic
   - **Never Accept**: Tests with "acceptable" failure rates
   - Success indicator: Test suite produces identical results on every run

## Examples

### Example 1: Routing Service Validation

**Context**: Validating that the routing service correctly matches agent requests to instruction files

**Scenario**: Agent needs to create a task, routing service must return task_creation_workflow.instructions.md

```typescript
describe('Routing Service - Task Creation Context', () => {
  const FIXED_REQUEST = {
    context: 'task creation',
    repoPath: '/path/to/project',
    filePatterns: ['**'],
    timestamp: new Date('2025-10-27T12:00:00Z').getTime()
  };

  beforeEach(() => {
    // Mock file system for deterministic instruction file discovery
    mockFileSystem({
      '/knowledge/instructions/project_management/task_creation_workflow.instructions.md': {
        frontmatter: {
          title: 'Task Creation Workflow',
          applies_to: ['**'],
          domains: ['project_management', 'agentic_workflows'],
          priority: 'P0'
        }
      }
    });
  });

  it('should route to task creation workflow with high confidence', async () => {
    const result = await routingService.matchInstructions(FIXED_REQUEST);

    // Deterministic assertions
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].file).toBe('task_creation_workflow.instructions.md');
    expect(result.matches[0].confidence).toBeGreaterThan(0.9);
    expect(result.matches[0].reason).toContain('context match: "task creation"');
  });

  it('should produce identical results on repeated calls', async () => {
    const result1 = await routingService.matchInstructions(FIXED_REQUEST);
    const result2 = await routingService.matchInstructions(FIXED_REQUEST);
    const result3 = await routingService.matchInstructions(FIXED_REQUEST);

    // Results must be byte-for-byte identical
    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });
});
```

**Expected Result**: Tests pass 100% of the time with identical outputs, providing reliable signals for agent decision-making

### Example 2: Audit Service Event Logging

**Context**: Validating that audit events are captured correctly and consistently

**Scenario**: Agent routing decisions must be logged for learning and compliance

```typescript
describe('Audit Service - Event Capture', () => {
  const FIXED_EVENT = {
    type: 'ROUTING_DECISION',
    timestamp: new Date('2025-10-27T12:00:00Z').getTime(),
    agentId: 'test-agent-001',
    decision: {
      instruction: 'task_creation_workflow.instructions.md',
      confidence: 0.95,
      context: 'task creation'
    }
  };

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('should log event with correct structure', async () => {
    const result = await auditService.logEvent(FIXED_EVENT);

    expect(result.success).toBe(true);
    expect(result.eventId).toMatch(/^evt-[a-z0-9]{8}$/);

    // Verify event stored correctly
    const stored = await auditService.getEvent(result.eventId);
    expect(stored.type).toBe('ROUTING_DECISION');
    expect(stored.agentId).toBe('test-agent-001');
    expect(stored.decision.confidence).toBe(0.95);
  });

  it('should handle concurrent event logging deterministically', async () => {
    // All events should be captured, no race conditions
    const events = Array(10).fill(null).map((_, i) => ({
      ...FIXED_EVENT,
      agentId: `test-agent-${String(i).padStart(3, '0')}`
    }));

    const results = await Promise.all(
      events.map(e => auditService.logEvent(e))
    );

    // All should succeed
    expect(results.every(r => r.success)).toBe(true);

    // All should be retrievable
    const stored = await Promise.all(
      results.map(r => auditService.getEvent(r.eventId))
    );
    expect(stored).toHaveLength(10);
  });
});
```

**Expected Result**: Event logging works deterministically even under concurrent load, providing reliable audit trail

**Trade-offs**: More setup code for mocking, but eliminates flakiness that would undermine agent confidence

### Example 3: Knowledge System Validation

**Context**: Validating instruction file parsing and metadata extraction

**Scenario**: System must parse instruction files consistently to enable routing

```typescript
describe('Knowledge System - Instruction Parsing', () => {
  const SAMPLE_INSTRUCTION = `---
title: "Test Instruction"
description: "Sample instruction for testing"
applies_to:
  - "**/*.ts"
domains:
  - "validation"
priority: "P0"
---

# Test Instruction

**Purpose**: Test purpose

## Core Principles

- Principle 1
- Principle 2
`;

  it('should parse instruction file frontmatter correctly', () => {
    const parsed = parseInstructionFile(SAMPLE_INSTRUCTION);

    expect(parsed.frontmatter.title).toBe('Test Instruction');
    expect(parsed.frontmatter.applies_to).toEqual(['**/*.ts']);
    expect(parsed.frontmatter.domains).toContain('validation');
    expect(parsed.frontmatter.priority).toBe('P0');
  });

  it('should extract sections with correct structure', () => {
    const parsed = parseInstructionFile(SAMPLE_INSTRUCTION);

    expect(parsed.sections).toHaveProperty('purpose');
    expect(parsed.sections).toHaveProperty('core_principles');
    expect(parsed.sections.core_principles).toHaveLength(2);
  });

  it('should produce identical parse results every time', () => {
    const parsed1 = parseInstructionFile(SAMPLE_INSTRUCTION);
    const parsed2 = parseInstructionFile(SAMPLE_INSTRUCTION);
    const parsed3 = parseInstructionFile(SAMPLE_INSTRUCTION);

    expect(parsed1).toEqual(parsed2);
    expect(parsed2).toEqual(parsed3);
  });
});
```

**Expected Result**: Parsing is completely deterministic, enabling reliable instruction routing

## Validation Checklist

Complete before marking validation implementation as done:

### Test Design Quality
- [ ] All tests use fixed, predictable inputs (no randomness, no Date.now())
- [ ] External dependencies mocked with deterministic responses
- [ ] Each test isolates its state (database reset, no shared state)
- [ ] Error paths tested with specific expected outcomes
- [ ] Tests produce binary pass/fail (no probabilistic assertions)

### Determinism Verification
- [ ] Test suite runs successfully 10+ times consecutively with identical results
- [ ] No flaky tests identified (all pass consistently)
- [ ] Tests run offline without external service dependencies
- [ ] Parallel test execution produces same results as serial
- [ ] CI/CD pipeline shows 100% pass rate over multiple commits

### Coverage Requirements
- [ ] All critical paths tested (routing, audit logging, knowledge parsing)
- [ ] All error conditions tested with expected graceful handling
- [ ] Integration points between services tested
- [ ] Resource constraints tested (permissions, dependencies)
- [ ] Operational readiness validated (services can start, connect, operate)

## Common Pitfalls

### Pitfall 1: Accepting Statistical Success Rates

- ❌ **Problem**: Using 95% success threshold instead of 100% pass requirement
- **Why it happens**: Porting tests from human-driven development where occasional failures are tolerated
- ✅ **Solution**: Replace statistical assertions with deterministic functional correctness tests
- **Example**: Instead of "passes 19/20 times", fix the root cause so it passes 20/20 times

### Pitfall 2: Time-Dependent Test Logic

- ❌ **Problem**: Tests use `Date.now()`, `setTimeout` without mocking, causing non-deterministic behavior
- **Why it happens**: Didn't recognize time as external dependency requiring control
- ✅ **Solution**: Mock all time-related functions, use fixed timestamps in test data
- **Example**: Mock `Date.now()` to return fixed timestamp, use deterministic delays

### Pitfall 3: Shared State Between Tests

- ❌ **Problem**: Tests pollute shared resources (database, files, globals), causing failures when run in different orders
- **Why it happens**: Insufficient isolation in test setup/teardown
- ✅ **Solution**: Reset all state before each test, use isolated test databases
- **Example**: Each test gets fresh database seeded with known test data

### Pitfall 4: Ignoring Flaky Tests

- ❌ **Problem**: Accepting tests that "usually pass" or re-running CI until tests pass
- **Why it happens**: Treating symptoms instead of addressing root cause
- ✅ **Solution**: Fix flaky tests immediately or remove them - no tolerance for non-determinism
- **Example**: Test fails intermittently due to race condition - add proper synchronization or remove test

### Pitfall 5: Insufficient Error Path Testing

- ❌ **Problem**: Only testing happy path, missing error conditions that agents will encounter
- **Why it happens**: Focusing on functionality over reliability
- ✅ **Solution**: Test every error path with expected graceful handling
- **Example**: Test API timeout, missing file, invalid input, permission denied - all with deterministic outcomes

## Edge Cases

### Edge Case 1: Non-Deterministic External Services

**When**: Tests require external service (GitHub API, MCP server) that cannot be made deterministic

**Approach**:
- Separate unit tests (mocked, deterministic) from integration tests (real services)
- Mark integration tests clearly, run separately from core test suite
- Provide mock implementations that match real service behavior exactly
- Consider contract testing to validate mocks match real APIs

**Example**: Routing service unit tests use mocked instruction file system (deterministic), integration tests use real file system (run separately)

### Edge Case 2: Probabilistic Algorithms Requiring Validation

**When**: Service uses ML model or heuristic with inherent probability (e.g., confidence scores)

**Approach**:
- Test with fixed inputs that produce known confidence scores
- Validate confidence calculation logic, not the score itself
- Use threshold tests with deterministic boundaries
- Document expected score ranges for known inputs

**Example**: Routing confidence score test uses fixed context that consistently produces 0.85-0.95 confidence, validates score is in range

### Edge Case 3: Race Conditions in Concurrent Operations

**When**: Service handles concurrent requests and tests need to validate thread safety

**Approach**:
- Use deterministic concurrency testing frameworks
- Control execution order with synchronization primitives
- Test with fixed concurrency levels (not random)
- Validate all concurrent operations complete successfully

**Example**: Audit service handles 10 concurrent events, test validates all 10 are captured without data loss

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Test passes locally but fails in CI | Environment differences (time zone, locale, resources) | Mock environment variables, use Docker for consistent environment |
| Test results vary between runs | Non-deterministic inputs (Date.now(), Math.random()) | Replace with fixed test data, mock time-related functions |
| Tests interfere with each other | Shared state not reset between tests | Add proper beforeEach/afterEach hooks to isolate state |
| Tests timeout intermittently | External service delays or resource contention | Mock external services, increase resource allocation, add timeout controls |
| Flaky test cannot be fixed | Fundamental non-determinism in code under test | Remove test and fix underlying code, or mark as integration test |
| 100% pass rate in controlled env, failures in production | Test environment doesn't match production | Enhance integration tests, add production monitoring, validate assumptions |

## Related Instructions

- **See also**: [trust_based_task_execution.instructions.md](../trust_execution/trust_based_task_execution.instructions.md) - P##.CV## (Completion Validation) requires deterministic validation
- **Prerequisites**: [feature_development.instructions.md](../trust_execution/feature_development.instructions.md) - Quality gates depend on deterministic validation
- **Next steps**: [agentic_decision_making.instructions.md](../agentic_workflows/agentic_decision_making.instructions.md) - Agents use validation results for decision-making

---

**Success Criteria**: All validation produces deterministic, repeatable results with 100% pass rate in controlled environments, providing reliable binary signals for agent decision-making.

**Confidence Check**: Can the test suite run 10 times consecutively with identical results? Are there any probabilistic assertions or acceptable failure rates? Do tests isolate their state completely?
