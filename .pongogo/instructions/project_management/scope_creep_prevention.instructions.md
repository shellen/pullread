---
pongogo_instruction_spec: "0.0.2"
title: "Scope Creep Prevention"
description: "Prevent scope creep through structured boundaries, approval gates, and change management."
applies_to:
  - "**/*"
domains:
  - "project_management"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - scope_creep
      - while_we're_at_it
      - scope_expansion
      - task_boundary
      - scope_change
      - feature_creep
      - out_of_scope
      - beyond_scope
    nlp: "Scope creep prevention, task boundary enforcement, recognizing and halting scope expansion"
evaluation:
  success_signals:
    - Scope boundaries identified before work begins
    - Danger phrases recognized and halted immediately
    - Scope change protocol applied when expansion detected
    - Simple tasks stay simple (audit only audits, fix only fixes)
    - Task completion matches original objective
  failure_signals:
    - Scope expanded without explicit approval
    - Danger phrases ignored ("while we're at it...")
    - Multiple objectives combined in single task
    - Strategic work in tactical task
    - Improvements added without scope change protocol
---


# Scope Creep Prevention

**Purpose**: Prevent scope expansion through systematic task boundary enforcement ensuring agent-coordinated development maintains focus and delivers predictable outcomes.

**Philosophy**: TASKS MUST STAY WITHIN STATED SCOPE - NO EXCEPTIONS. Scope expansion, even with good intentions, wastes resources and derails strategic priorities.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Beginning any task execution (validate scope before starting)
- **Scenario 2**: Mid-task when recognizing potential scope expansion ("while we're at it...")
- **Scenario 3**: Receiving feedback suggesting additional work beyond original scope
- **Scenario 4**: Agents proposing "improvements" or "optimizations" not in original requirements
- **Scenario 5**: Code review or PR feedback introducing new requirements

---

## Quick Reference

**Scope Creep Recognition and Prevention**:

**1. Danger Phrases** (Immediate Red Flags):
- "While we're at it..." → STOP - Scope expansion signal
- "This would be a good opportunity to..." → STOP - Strategic creep
- "Let's make this more strategic..." → STOP - Framework creep
- "We should optimize this for the future..." → STOP - Redesign creep
- "Since we're already working here..." → STOP - Efficiency trap

**2. Task Type Boundaries** (Rigid Rules):
```
Audit Task → Only audit, don't rebuild or optimize
Compliance Task → Only address compliance, don't add features
Documentation Task → Only document existing, don't redesign
Bug Fix Task → Only fix specific bug, don't refactor modules
Infrastructure Task → Only implement stated infra, no "nice to have"
```

**3. Scope Change Protocol** (When Expansion Recognized):
```
Step 1: IMMEDIATELY STOP current work
Step 2: Explain original scope and proposed change to human
Step 3: WAIT for EXPLICIT approval before proceeding
Step 4: If approved → Update task officially (AC, scope boundaries, complexity)
Step 5: If rejected → Return to original scope
```

**4. Scope Validation Checklist** (Before Starting):
- [ ] Task title and objective read carefully
- [ ] Specific, limited scope explicitly identified
- [ ] What IS included understood
- [ ] What is NOT included understood
- [ ] Boundaries clear before work begins

**5. Is This Scope Expansion?** (Decision Tree):
```
Proposed work beyond original task objective?
├─ YES → SCOPE EXPANSION
│  ├─ Apply scope change protocol
│  └─ Get explicit approval before proceeding
└─ NO → Within original scope
   └─ Proceed with implementation
```

**6. Common Scope Expansion Patterns**:
```
Pattern 1: Simple → Complex
- Original: "Add health check endpoint"
- Expanded: "+ readiness + liveness + aggregation"
- **Status**: SCOPE EXPANSION

Pattern 2: Tactical → Strategic
- Original: "Audit CLI documentation"
- Expanded: "Create CLI documentation framework"
- **Status**: SCOPE EXPANSION

Pattern 3: Fix → Refactor
- Original: "Fix authentication token expiry bug"
- Expanded: "Redesign entire token management system"
- **Status**: SCOPE EXPANSION

Pattern 4: Document → Redesign
- Original: "Document API Gateway config options"
- Expanded: "Build interactive configuration tool"
- **Status**: SCOPE EXPANSION
```

**7. When to Create Separate Task** (Instead of Expanding):
- Additional features beyond stated requirements
- Strategic improvements ("make it better for future")
- Optimizations not in original acceptance criteria
- Related improvements discovered during work
- **Action**: Complete original task; create new task for additions

---

## Core Principles

- **Scope Immutability**: Every task has specific, limited objective - expanding scope without explicit approval is process failure
- **Warning Signs Recognition**: Specific phrases and patterns signal scope creep ("while we're at it", "make this more strategic")
- **Simple Tasks Stay Simple**: Audit tasks only audit, compliance tasks only address compliance, bug fixes only fix specific bugs
- **Mandatory Scope Change Protocol**: Recognize expansion, stop work, explain to human, wait for approval, update task officially
- **Agent Boundary Enforcement**: Agents must recognize and halt scope expansion autonomously before human intervention required

## Step-by-Step Guidance

1. **Validate Task Scope Before Beginning (Mandatory)**
   - Read original task title and objective carefully
   - Identify specific, limited scope explicitly
   - Note what is included AND what is excluded
   - Confirm understanding matches stated scope
   - Expected outcome: Clear scope boundaries understood before any work begins
   - Rationale: Prevents scope expansion by establishing baseline understanding

2. **Monitor for Scope Expansion Warning Signs**
   - Watch for danger phrases: "while we're at it", "this is a good opportunity to", "let's make this more strategic"
   - Recognize patterns: Adding functionality not in original task, implementing strategic improvements in tactical tasks
   - Common variation: Combining multiple objectives in single task execution
   - Success indicator: Early recognition of scope expansion attempts before significant work invested

3. **Apply Task Boundary Rules**
   - **Audit tasks**: Only audit, don't rebuild or optimize systems
   - **Compliance tasks**: Only address compliance requirements, don't add features
   - **Documentation tasks**: Only document existing functionality, don't redesign systems
   - **Bug fixes**: Only fix specific bug, don't refactor entire modules
   - **Infrastructure tasks**: Only implement stated infrastructure, don't add "nice to have" features
   - Integration point: Rules prevent common scope expansion patterns

4. **Execute Scope Change Protocol When Expansion Recognized**
   - IMMEDIATELY stop current work when scope expansion recognized
   - Explain original scope and proposed change to human clearly
   - Wait for EXPLICIT approval before proceeding with expanded scope
   - If approved, update task officially (add acceptance criteria, adjust scope boundaries and complexity if applicable)
   - If rejected, return to original scope boundaries
   - Success indicator: Scope change explicitly approved and documented before proceeding

5. **Maintain Focus on Original Objective**
   - Task completion addresses original objective completely
   - No functionality added beyond stated requirements
   - Work complexity matches original task assessment
   - Success criteria align with original scope
   - Expected outcome: Predictable, focused delivery matching original commitment

## Examples

### Example 1: Recognizing and Halting Scope Expansion

```markdown
# Original Task: "Task: Add Health Check Endpoint to API Gateway"

## Original Scope (from issue description)
- Implement `/health` endpoint returning 200 OK
- Response includes service status field
- No authentication required for health checks
- Endpoint documented in OpenAPI spec

## Work Begins - Agent Implementation
```typescript
// Implementing health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});
```

## SCOPE EXPANSION ATTEMPTED
**Agent thinking**: "While implementing health checks, I notice we should also add:
- Readiness checks (separate `/ready` endpoint)
- Liveness checks (separate `/live` endpoint)
- Dependency health checks (verify database, Redis connectivity)
- Detailed status information (uptime, version, memory usage)
- Health check aggregation across all microservices"

## STOP - Apply Scope Change Protocol

**Step 1: Recognize scope expansion**
- Original task: Single `/health` endpoint with status field
- Proposed addition: 4 additional endpoints + dependency checks + aggregation
- **This is NOT in original scope**

**Step 2: Stop work**
- Health check basic implementation complete (matches original scope)
- DO NOT implement readiness/liveness/aggregation without approval

**Step 3: Explain to human**
"I've completed the original task: `/health` endpoint with status field. While implementing, I recognized potential enhancements (readiness checks, dependency health, aggregation) that would expand scope significantly. Should I:
1. Mark current task complete as-is (original scope satisfied)
2. Create new task for enhanced observability (scope expansion)
3. Modify current task scope with approval (requires scope change)"

**Step 4: Wait for approval**
[Human responds: "Complete current task as-is. Create separate task for enhanced observability in Milestone 3."]

**Step 5: Execute decision**
- Mark original task complete (original scope satisfied)
- Create new task: "Enhanced Health Check Observability" in Milestone 3
- Document relationship: New task builds on completed task
```

**Context**: Agent recognizes scope expansion during implementation and halts before proceeding. Scope change protocol applied systematically, preventing wasted effort.

**Expected Result**: Original task completed within scope; enhanced features properly scoped as separate task with strategic timing.

### Example 2: Danger Phrases and Scope Creep Patterns

```markdown
## Scenario: "Task: Audit CLI Command Documentation"

### SCOPE CREEP EXAMPLES

**Danger Phrase 1**: "While we're at it, we could also..."
- "While auditing docs, we could also *rewrite command descriptions* for better clarity"
- **Problem**: Audit scope only, not rewrite
- **Boundary**: Document what's missing/incorrect; don't rewrite content

**Danger Phrase 2**: "This would be a good opportunity to..."
- "Auditing CLI docs is a good opportunity to *standardize all documentation formats* across services"
- **Problem**: Standardization is separate strategic initiative, not audit task
- **Boundary**: Focus on CLI docs only; standardization requires separate task

**Danger Phrase 3**: "We should make this more strategic..."
- "Instead of just auditing, we should *create comprehensive CLI documentation framework* for future extensibility"
- **Problem**: Framework creation is strategic work beyond audit scope
- **Boundary**: Audit existing docs; framework is Epic-level work requiring separate planning

**Danger Phrase 4**: "Let's optimize this for the future..."
- "Let's not just audit but *redesign documentation structure* for better agent discoverability"
- **Problem**: Redesign is architectural work, not audit
- **Boundary**: Audit identifies issues; redesign addressed in separate task

### CORRECT SCOPE ADHERENCE

**Original Scope**: Audit CLI command documentation for completeness and accuracy

**Execution**:
1. Review all CLI commands listed in docs
2. Verify each command documented with usage examples
3. Check for missing commands not documented
4. Identify incorrect or outdated information
5. Create report listing findings (missing, incorrect, outdated)

**Outcome**: Report delivered with audit findings. Remediation work scoped as separate tasks based on findings.
```

**Context**: Common danger phrases signal scope creep. Agent recognizes patterns and maintains audit-only boundary.

**Trade-offs**: Identifying improvement opportunities feels productive, but scope adherence delivers predictable results without resource waste.

### Example 3: Simple Tasks Stay Simple

```markdown
## Task Type: Bug Fix

**Original Task**: "Fix authentication token expiry bug where tokens expire 1 hour early"

### SCOPE CREEP
- Fixing bug reveals authentication service could be *refactored for better architecture*
- "While fixing expiry, let's *redesign entire token management system*"
- "This bug indicates we should *implement comprehensive auth refactoring Epic*"

### CORRECT SCOPE
- Investigate token expiry calculation
- Identify bug: timezone offset not accounted in expiry calculation
- Fix calculation to include timezone offset
- Add test validating timezone handling
- Deploy fix and verify tokens expire at correct time

**Outcome**: Bug fixed, token expiry works correctly. If refactoring needed, create separate Epic with proper scoping.

---

## Task Type: Documentation

**Original Task**: "Document API Gateway configuration options"

### SCOPE CREEP
- "While documenting config, let's *redesign configuration system* for better usability"
- "Documentation reveals we should *create configuration management service*"
- "Let's not just document but *build interactive configuration tool*"

### CORRECT SCOPE
- List all configuration options from config schema
- Document each option: description, type, default value, examples
- Organize documentation by configuration category
- Include validation rules and constraints
- Publish documentation in docs/reference/api-gateway-config.md

**Outcome**: Configuration documented. System improvements scoped separately if justified.
```

**Context**: Simple task categories (bug fixes, documentation, audits) have clear boundaries. Scope discipline prevents expansion into strategic work.

**Expected Result**: Tasks completed quickly and predictably within stated boundaries; strategic improvements addressed through proper planning process.

## Validation Checklist

- [ ] Task scope read and understood before beginning work (title, objectives, acceptance criteria)
- [ ] Scope boundaries identified (what IS included, what is NOT included)
- [ ] Danger phrases monitored during execution ("while we're at it", "good opportunity to")
- [ ] Task type boundary rules applied (audit only audits, bug fix only fixes bug)
- [ ] Scope expansion recognized if attempted (work proposed beyond original scope)
- [ ] Scope change protocol executed if expansion occurred (stop, explain, wait for approval)
- [ ] Task completion matches original objective (no added functionality without approval)
- [ ] Work complexity matches original assessment (simple tasks stayed simple)
- [ ] Success criteria aligned with original scope (not expanded criteria)

## Common Pitfalls

### Pitfall 1: "Improving" Task Scope Without Permission

- **Problem**: Agent recognizes improvement opportunity and implements it believing it adds value, but work was outside original scope
- **Why it happens**: Good intentions ("making things better") without understanding scope discipline importance
- **Solution**: Recognize that ANY work beyond stated scope requires explicit approval; improvements are scope changes requiring protocol
- **Example**: Task to "add logging" expanded to "add logging + distributed tracing + metrics" - tracing and metrics are scope expansion

### Pitfall 2: Combining Multiple Objectives in Single Task

- **Problem**: Task execution addresses original objective PLUS related improvements discovered during work
- **Why it happens**: Efficiency mindset ("since we're already working here, let's fix this too")
- **Solution**: Original objective ONLY; related improvements become separate tasks with proper scoping and prioritization
- **Example**: Fixing authentication bug also refactors auth service architecture - refactoring should be separate task

### Pitfall 3: Interpreting Simple Tasks as Strategic Opportunities

- **Problem**: Audit task interpreted as opportunity to redesign system being audited; bug fix seen as refactoring opportunity
- **Why it happens**: Misunderstanding that audit/fix tasks have narrow, tactical scope not strategic scope
- **Solution**: Simple tasks stay simple; strategic work requires strategic planning process (Epic creation, proper scoping)
- **Example**: "Audit API documentation" becomes "Create comprehensive API documentation framework" - framework creation is Epic-level work

### Pitfall 4: Failing to Recognize Scope Expansion Early

- **Problem**: Significant work invested in scope expansion before recognizing it's outside original boundaries
- **Why it happens**: Not monitoring for danger phrases or patterns; assuming expanded work is still "related" to original task
- **Solution**: Apply scope validation continuously during execution; stop IMMEDIATELY when expansion recognized
- **Example**: Implementing health checks, then readiness checks, then dependency checks before realizing all beyond original scope

## Edge Cases

### Edge Case 1: Scope Clarification vs Scope Expansion

**When**: Unclear whether proposed work is clarifying ambiguous original scope or expanding beyond stated scope

**Approach**:
1. Review original task description carefully (what was explicitly stated?)
2. Check acceptance criteria (does proposed work satisfy existing criteria?)
3. If genuinely ambiguous: Ask human for clarification before proceeding
4. If clearly expansion: Apply scope change protocol
5. Document clarification in task comments for future reference

**Example**: Task says "implement rate limiting" but doesn't specify per-user vs per-IP. Clarifying which type is scope clarification; adding BOTH types is scope expansion.

### Edge Case 2: Discovered Blocker Requiring Scope Expansion

**When**: Original task cannot be completed without addressing blocker not anticipated in original scope

**Approach**:
1. Document blocker clearly (what prevents original task completion?)
2. Determine if blocker is prerequisite or scope expansion
3. If prerequisite: Create separate task for blocker; mark original task blocked
4. If scope expansion disguised as blocker: Apply scope change protocol
5. Update task relationships and dependencies

**Example**: Implementing rate limiting requires Redis, but Redis not deployed yet. Redis deployment is prerequisite (separate task), not scope expansion of rate limiting task.

### Edge Case 3: Feedback Introducing New Requirements

**When**: Code review or PR feedback suggests adding features/changes beyond original acceptance criteria

**Approach**:
1. Distinguish between feedback on implementation quality vs new requirements
2. Implementation quality feedback (different approach, better code structure) = ACCEPTABLE
3. New requirements (additional features, different functionality) = SCOPE EXPANSION
4. Apply scope change protocol for new requirements
5. Document decision in PR comments

**Example**: PR feedback "also add metrics endpoint" is new requirement (scope expansion); feedback "use async/await instead of callbacks" is implementation quality (acceptable).

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Task complexity increased beyond original assessment | Scope expanded during execution without recognition | Audit work performed; identify scope additions; halt expansion; complete original scope only |
| PR includes functionality not in acceptance criteria | Scope creep during implementation | Request PR revision removing out-of-scope work; create separate tasks for additional functionality |
| Agent proposes "improvements" beyond task scope | Good intentions without scope discipline | Recognize as scope expansion; create separate improvement tasks; focus on original scope |
| Simple task becomes complex Epic-level work | Scope expansion through incremental additions | Stop work; decompose into proper Epic with tasks; complete original simple task first |
| Task blocked by "requirements" discovered mid-execution | Unclear whether blocker or scope expansion | Analyze if truly prerequisite or disguised expansion; create separate task for prerequisites |
| Multiple objectives combined in single task | Efficiency mindset overriding scope boundaries | Separate into individual tasks; complete original objective; queue additional work appropriately |

## Related Instructions

- **See also**: [Task Epic Basics](./task_epic_basics.instructions.md) - Understanding proper task scoping before execution
- **See also**: [Milestone Governance](./milestone_governance.instructions.md) - Strategic categorization preventing scope misalignment
- **See also**: [Systematic Prevention Framework](../safety_prevention/systematic_prevention_framework.instructions.md) - Systematic approach to preventing scope creep patterns
- **Prerequisites**: [Task Epic Basics](./task_epic_basics.instructions.md) - Understanding task structure and acceptance criteria
- **Next steps**: [Development Workflow Essentials](../trust_execution/development_workflow_essentials.instructions.md) - Completing tasks within scope using trust-based phases

---

**Success Criteria**: All tasks completed within stated scope, scope expansion recognized immediately when attempted, scope change protocol applied systematically, simple tasks stayed simple, and no functionality added beyond original acceptance criteria without explicit approval.

**Confidence Check**: Can you identify danger phrases signaling scope creep? Do you understand when to apply scope change protocol?
