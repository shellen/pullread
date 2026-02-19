---
pongogo_instruction_spec: "0.0.2"
title: "Time-Free Project Management"
description: "Principles for managing projects without time-based estimates or deadlines."
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
      - time_free
      - no_estimates
      - no_deadlines
      - complexity_based
      - scope_boundaries
      - time_estimate
      - commit_driven
    nlp: "Time-free project management using complexity-based scoping instead of time estimates, sustainable development"
evaluation:
  success_signals:
    - Complexity classification used (Simple/Moderate/Complex)
    - No time estimates in issues (hours, days, weeks, deadlines)
    - Scope boundaries clearly defined (deliverables, constraints)
    - Autonomy level appropriate for complexity
    - Quality criteria over velocity metrics
  failure_signals:
    - Time estimates in planning artifacts
    - T-shirt sizing as proxy for time (S/M/L hours)
    - Deadlines or target dates specified
    - Velocity tracking (story points per week)
    - Rushing execution to show progress (commit frequency)
---


# Time-Free Project Management

**Purpose**: Establish project management principles using complexity-based scoping instead of time estimates to enable sustainable, quality-first development.

**Philosophy**: Sustainable development prioritizes quality and appropriate scoping over time-based metrics and deadlines.

---

## When to Apply

Use time-free project management when:

- Creating new issues, epics, or project planning documents
- Reviewing existing templates for time-based language
- Defining task scope and complexity
- Setting work priorities and sequencing
- Evaluating autonomy levels for work items

---

## Quick Reference

**Key Decision Criteria**:

**1. Complexity Classification**:
- **Simple**: Established patterns exist, routine operations, standalone work
- **Moderate**: Some new design, multiple integration points, requires judgment calls
- **Complex**: Novel architecture, cross-system dependencies, significant unknowns

**2. Scope Boundary Questions**:
- What outputs constitute "done"? (deliverables)
- What is explicitly excluded? (constraints)
- What can change vs must remain fixed? (flexibility)

**3. Autonomy Level Assignment**:
- **Simple** -> Suggest + Confirm (SC): Agent proposes, human approves
- **Moderate** -> Apply + Check (AC): Agent executes, human spot-checks
- **Complex** -> Confirm + Validate (CV): Human involved at multiple checkpoints

**4. Anti-Pattern Detection**:
- Any mention of hours, days, weeks, sprints, deadlines
- "This should take about..." or "estimated duration"
- Time-based metrics for progress tracking
- Replace with complexity, scope boundaries, quality criteria

---

## Core Principles

- **No Time Estimates**: Never use hours, weeks, or deadlines in planning or scoping
- **No Estimation Without Measurement**: Never estimate without tracking actuals for comparison
- **Complexity-Based Sizing**: Classify work as Simple, Moderate, or Complex based on decisions and patterns required
- **Scope Boundaries**: Define clear boundaries for autonomous execution without time pressure
- **Quality Over Speed**: Emphasize completeness and correctness over delivery velocity
- **Autonomy Alignment**: Complexity assessment guides appropriate agent autonomy level
- **Execution Pace Freedom**: Time-free applies to execution pace, not just planning - rushing execution violates time-free as much as adding time estimates
- **Minimum Commits, Maximum Completeness**: Commits are publication (completeness), not progress (velocity) - one comprehensive commit is better than multiple incomplete commits

### Execution Pace and the Time-Free Principle

**Key Insight**: Time-free principle applies to **execution pace**, not just planning. Rushing through execution violates time-free principles just as much as adding time estimates to tasks.

**What This Means**:
- Take time to analyze thoroughly before acting
- Complete understanding phase before execution phase
- Single comprehensive pass > multiple rushed passes requiring rework
- Don't optimize for visible progress (commit velocity)
- Don't rush to commit "what I have" before verifying completeness
- Don't treat commit frequency as a success metric

**Commits Are Not Progress**:
- Commits represent **publication** (complete, reviewed work ready for others)
- Commits do NOT represent **progress** (incremental activity)
- One comprehensive commit demonstrates more competence than three incomplete commits
- Multiple commits for same task = indicator of incomplete analysis

**Before Committing, Ask**:
1. "Have I systematically reviewed ALL relevant items?"
2. "Have I cross-referenced ALL relevant sources?"
3. "If I commit now, will user need to ask for another pass?"
4. "Am I committing because work is COMPLETE, or because I want to show progress?"

## Step-by-Step Guidance

### 1. **Classify Work Complexity**
   - Assess pattern availability: Are established patterns available or new design required?
   - Evaluate decision complexity: Routine operations vs architectural decisions?
   - Consider integration points: Standalone vs multi-system integration?
   - Assign complexity: Simple, Moderate, or Complex
   - Expected outcome: Clear complexity classification without time estimates

### 2. **Define Scope Boundaries**
   - Identify deliverables: What specific outputs constitute completion?
   - Establish constraints: What should explicitly NOT be included?
   - Document dependencies: What must be complete before starting?
   - Define validation: How will completion be verified?
   - Expected outcome: Bounded scope enabling autonomous execution

### 3. **Determine Autonomy Level**
   - Map complexity to autonomy: Simple->Apply, Moderate->Patch, Complex->Propose
   - Identify approval gates: What reviews required before progression?
   - Document decision authority: What decisions can agent make independently?
   - Expected outcome: Appropriate autonomy level for complexity

### 4. **Remove Time-Based Language**
   - Scan for prohibited patterns: "hours", "weeks", "deadline", "time box"
   - Replace with complexity assessment: Simple/Moderate/Complex classification
   - Update templates: Remove time-based fields from issue templates
   - Validate compliance: Grep templates and issues for time references
   - Expected outcome: All planning artifacts time-free

## Examples

### Example 1: Complexity Classification

Context: Sizing different types of work

```markdown
## Simple Complexity Example
**Task**: Add new REST endpoint following existing patterns

**Why Simple**:
- Routing pattern established
- Authentication middleware available
- Standard CRUD operations
- Existing test templates
- Documentation format defined

**Autonomy Level**: Apply (bounded) - agent can implement directly
**Approval**: Post-apply review

## Moderate Complexity Example
**Task**: Implement instruction routing service

**Why Moderate**:
- Core pattern exists (file path matching)
- Systematic analysis of metadata required
- Integration with MCP server context needed
- New caching strategy required
- Pattern matching edge cases need testing

**Autonomy Level**: Patch (supervised) - pre-merge review required
**Approval**: Technical review before merge

## Complex Complexity Example
**Task**: Design autonomy ladder implementation

**Why Complex**:
- Architectural decisions (propose/patch/apply boundaries)
- Multi-agent coordination patterns undefined
- Approval gate mechanisms need design
- Rollback strategy must be architected
- Security model affects entire system

**Autonomy Level**: Propose (design) - architecture review required
**Approval**: Design approval before implementation
```

**Context**: Guiding task selection and autonomy level determination
**Expected Result**: Clear complexity classification enabling appropriate autonomy

### Example 2: Template Compliance Correction

Context: Converting time-based issue template to complexity-based

```yaml
## BEFORE: Time-Based Template
name: Task
description: Bounded work unit (1-3 hours)
body:
  - type: textarea
    label: Time Validation
    description: Was this actually 1-3 hours of work?
  - type: input
    label: Estimated Duration
    description: How long will this take?

## AFTER: Complexity-Based Template
name: Task
description: Bounded work unit for agent execution
body:
  - type: dropdown
    label: Complexity Assessment
    options:
      - Simple (established patterns)
      - Moderate (systematic analysis required)
      - Complex (architectural decisions required)
  - type: textarea
    label: Scope Validation
    description: Was the actual work scope aligned with defined boundaries?
```

**Context**: Template audit process removing time-based language
**Expected Result**: Compliance with time-free project management principles

### Example 3: Epic Sizing Without Time Estimates

Context: Planning authentication epic

```markdown
## WRONG: Time-Based Approach
Epic: User Authentication (2 weeks)
  Task: Implement JWT middleware (4 hours)
  Task: Add password hashing (2 hours)
  Task: Create login endpoint (3 hours)
  Task: Write tests (5 hours)

## CORRECT: Complexity-Based Approach
Epic: User Authentication (Moderate Complexity)
  Task: Implement JWT middleware (Simple - follows Express.js patterns)
    - Autonomy: Apply (bounded)
    - Scope: JWT validation, token generation, standard claims
    - Validation: Tests pass, security review complete

  Task: Add password hashing (Simple - bcrypt library integration)
    - Autonomy: Apply (bounded)
    - Scope: Hash generation, comparison, salt rounds config
    - Validation: Security standards met, tests passing

  Task: Create login endpoint (Moderate - security decisions required)
    - Autonomy: Patch (supervised)
    - Scope: Credentials validation, session creation, error handling
    - Validation: Security review, integration tests, docs updated

  Task: Document authentication flow (Simple - template exists)
    - Autonomy: Apply (bounded)
    - Scope: API docs, architecture diagrams, usage examples
    - Validation: Documentation complete, examples working
```

**Context**: Epic decomposition without artificial time pressure
**Expected Result**: Quality-focused scope boundaries with clear autonomy levels

## Validation Checklist

Ensure time-free compliance:

- [ ] No time estimates in issue bodies (hours, days, weeks)
- [ ] No deadlines or target dates specified
- [ ] Complexity assessment included (Simple/Moderate/Complex)
- [ ] Scope boundaries clearly defined
- [ ] Autonomy level appropriate for complexity
- [ ] Approval gates documented
- [ ] Issue templates time-free
- [ ] Validation criteria based on scope not time

## Common Pitfalls

### Pitfall 1: Hidden Time Estimates

- **Problem**: Using T-shirt sizing (S/M/L) as proxy for time estimates
- **Why it happens**: Attempting to preserve velocity calculations
- **Solution**: Use explicit complexity criteria (patterns, decisions, integration)
- **Example**: "Medium task" -> "Moderate complexity requiring systematic analysis of 3 integration points"

### Pitfall 2: Implicit Deadlines in Priorities

- **Problem**: Priority labels implying timeframes ("This week", "Next sprint")
- **Why it happens**: Traditional sprint-based planning habits
- **Solution**: Use blocking-based priorities (Critical blocks work, High provides value)
- **Example**: "Sprint priority" -> "Critical - blocks API service deployment"

### Pitfall 3: Time-Based Scope Validation

- **Problem**: Asking "Did this take the expected time?" in retrospectives
- **Why it happens**: Attempting to "improve estimates"
- **Solution**: Ask "Was scope aligned with complexity assessment?"
- **Example**: "Took longer than estimated" -> "Complexity was actually higher due to unforeseen integration points"

### Pitfall 4: Velocity Metrics

- **Problem**: Tracking "story points per week" or similar velocity measures
- **Why it happens**: Desire for predictability and planning
- **Solution**: Track completion rate by complexity (Simple tasks completed this month)
- **Example**: "15 points per sprint" -> "Completed 8 simple tasks, 3 moderate features"

## Edge Cases

### Edge Case 1: External Dependencies with Deadlines

**When**: Third-party integration has contractual deadline
**Approach**:
- Acknowledge external constraint exists
- Plan work backward from constraint using complexity
- Prioritize critical path items appropriately
- Do not propagate deadline to individual task estimates
- Document constraint as context, not scope

### Edge Case 2: Marketing or Launch Coordination

**When**: Feature needs coordination with marketing campaign
**Approach**:
- Document coordination requirement as context
- Identify minimum viable scope for coordination
- Use priority system to sequence work
- Complexity-based planning still applies
- Communicate readiness, not delivery dates

### Edge Case 3: Regulatory or Compliance Deadlines

**When**: Legal or regulatory requirement has fixed date
**Approach**:
- Document compliance requirement with legal reference
- Identify scope required for compliance
- Prioritize compliance work as Critical
- Non-compliance work remains complexity-based
- Escalate if complexity assessment indicates risk

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Agents asking for time estimates | Issue templates still contain time fields | Audit and remove time-based fields |
| Pressure to commit to delivery dates | External stakeholder expectations | Communicate complexity-based approach |
| Difficulty prioritizing without time | Conflating priority with urgency | Use blocking-based priority |
| Templates still reference deadlines | Incomplete template migration | Grep templates for time keywords |
| Scope creep without time bounds | Unclear scope boundaries | Define explicit scope boundaries |

---

**Success Criteria**: All project planning artifacts use complexity-based scoping without time estimates, enabling sustainable development with appropriate autonomy levels and quality-first focus.

**Confidence Check**: Can you explain scope boundaries without referencing time? Is complexity assessment based on patterns and decisions, not duration? Are approval gates defined by risk, not calendar?
