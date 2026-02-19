---
pongogo_instruction_spec: "0.0.2"
title: "Development Workflow Essentials"
description: "Essential development workflow patterns, practices, and coordination standards."
applies_to:
  - "**/*"
domains:
  - "trust_execution"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 0
  triggers:
    keywords:
      - development_workflow
      - complete_context
      - phase_completion
      - four-level_completion
      - task_completion
      - epic_completion
      - milestone_completion
      - evidence_summary
      - trust_phases
      - quality_gates
    nlp: "Development workflow with complete context reading, four-level completion framework (phase/task/epic/milestone), trust-based phase execution, evidence-based progress tracking"
evaluation:
  success_signals:
    - Complete files read (never head/tail/truncation during development)
    - Previous phase outputs trusted without re-analysis
    - "Four-level completion followed (Phase -> Task -> Epic -> Milestone)"
    - Evidence summary with specific artifacts linked (commits, files, tests)
    - All SC/AC/CV items checked before marking complete
  failure_signals:
    - Partial context reading (head -n 100 or content.slice)
    - Re-analyzing completed phases instead of trusting outputs
    - Marking complete before all criteria items checked
    - Completion comment says "done" without linked evidence
    - Missing work log entries at task/epic/milestone completion
---


# Development Workflow Essentials

**Purpose**: Define essential workflow standards for feature development including complete context requirements, trust-based phase execution, and four-level completion framework.

**Philosophy**: Complete context enables correct decisions, validated phases build foundational truth, and systematic completion tracking ensures nothing is missed.

---

## When to Apply

Use these standards when:

- Implementing features for agent team systems
- Reading any file, issue, or content during development work
- Completing phases, tasks, Epics, or milestones
- Validating work meets quality gates before marking complete
- Coordinating work across multiple services

---

## Quick Reference

**Essential Workflow Patterns**:

**1. Complete Context Reading** (ALWAYS):
```typescript
// ✅ Complete file reading
const fileContent = await readFile(filePath, 'utf-8'); // Full content
const issue = await octokit.issues.get({ issue_number: 42 }); // Complete issue

// ❌ NEVER use partial reads during development
const preview = await head(filePath, 10); // WRONG - creates knowledge gaps
const snippet = content.slice(0, 1000); // WRONG - incomplete context
```

**2. Four-Level Completion Framework**:
```
Level 1: Phase Complete
├─ Trigger: All Success Criteria items checked
├─ Actions: Update checkboxes + completion comment + (optional) work log
└─ Evidence: Commits, files, tests linked

Level 2: Task Complete
├─ Trigger: ALL Acceptance Criteria AND ALL Completion Validation items checked
├─ Actions: Update checkboxes + completion comment + work log + close issue
└─ Evidence: All tests passing (100%), docs updated, integration validated

Level 3: Epic Complete
├─ Trigger: ALL Epic tasks (1/X through X/X) closed
├─ Actions: Epic completion comment + work log + close Epic
└─ Evidence: All tasks closed, Epic objectives met, learnings captured

Level 4: Milestone Complete
├─ Trigger: ALL milestone issues closed
├─ Actions: Retrospective doc + comprehensive work log + close milestone
└─ Evidence: All issues closed, objectives achieved, strategic summary
```

**3. Trusting Previous Phases**:
```markdown
Starting Validation Phase?
├─ Read implementation completion comment
├─ Extract implementation outputs and recommendations
├─ DO: Implement per implementation recommendations
├─ DO: Validate validation against validation criteria
├─ DON'T: Re-analyze implementation decisions
└─ DON'T: Question implementation validated work
```

**4. Phase Completion Evidence Template**:
```markdown
## Phase P## Complete - [Phase Name]

**Evidence Summary**:
- ✅ P##.SC01: [What completed] ([Evidence: commit SHA, file, test])
- ✅ P##.SC02: [What completed] ([Evidence])
- ✅ P##.SC03: [What completed] ([Evidence])

**Implementation Highlights**:
- Key decision and rationale
- Trade-offs made
- Technical debt incurred (if any)

**Next Phase**: P## - [Next Phase Name]
```

**5. Task Completion Validation Checklist**:
- [ ] All Success Criteria items checked with evidence
- [ ] All Acceptance Criteria items checked with validation docs
- [ ] All Completion Validation items checked with operational evidence
- [ ] All tests passing (100% deterministic pass rate)
- [ ] Documentation updated (code, API, user, architecture)
- [ ] Work log entry created with outcomes
- [ ] Issue closed with "Closes #X" in commit

**6. When to Mark Complete vs Continue Work**:
```
Can mark Phase complete?
├─ All SC items checked? NO → Continue implementation
└─ All SC items checked? YES → ✅ MARK COMPLETE + add evidence comment

Can mark Task complete?
├─ All AC items checked? NO → Continue quality validation
├─ All CV items checked? NO → Continue operational validation
└─ All AC and CV checked? YES → ✅ MARK COMPLETE + close issue

Can mark Epic complete?
├─ All Epic tasks closed? NO → Continue feature work
└─ All tasks closed? YES → ✅ MARK COMPLETE + capture learnings
```

**7. Complete Context Anti-Patterns** (AVOID):
- ❌ Using `head -n 100 file.md` → Read complete file
- ❌ Using `content.slice(0, 1000)` → Read complete content
- ❌ Scanning "first few lines" → Read entire file
- ❌ "Quick check" with partial read → Complete read every time

---

## Core Principles

- **Complete Context Requirement**: Always read complete files/content, never use partial reads (head/tail/truncation)
- **Trust Validated Phases**: When phase is marked complete with all checkboxes, trust outputs as foundational truth
- **Four-Level Completion**: Phase → Task → Epic → Milestone, each with specific completion requirements
- **Systematic Validation**: Every level has explicit Success Criteria, Acceptance Criteria, and Completion Validation
- **Evidence-Based Progress**: Document completion with evidence summary, not just checkbox marking

## Step-by-Step Guidance

### Step 1: Maintain Complete Context During Development

Never use partial reads during feature development - always access complete content.

1. **Use Complete Reading Methods**:
   ```typescript
   // ✅ Complete file reading
   const fileContent = await readFile(filePath, 'utf-8'); // Full content
   const issue = await octokit.issues.get({ issue_number: 42 }); // Complete issue

   // ❌ Never use partial reads
   const preview = await head(filePath, 10); // WRONG - creates knowledge gaps
   const snippet = content.slice(0, 1000); // WRONG - incomplete context
   ```
   - Expected outcome: Complete understanding of content before making decisions
   - Rationale: Partial context violates systematic prevention principles

2. **Handle Large Files Properly**:
   - Use pagination/batching for truly large files
   - Process complete sections sequentially
   - Never resort to sampling or truncation
   - Success indicator: All relevant content processed, no gaps

3. **Apply to All Development Reading**:
   - GitHub issues and PR descriptions
   - Instruction files and documentation
   - Code files requiring modification
   - Configuration files
   - Integration point: Ensures decisions based on complete information

### Step 2: Trust Completed Phases

When phase is marked complete, trust the outputs without re-analyzing.

1. **Read Previous Phase Outputs**:
   ```markdown
   ## Design Phase Complete - Requirements Analysis ✓

   **Evidence Summary**:
   - ✅ Design.SC01: User stories documented (see issue body)
   - ✅ Design.SC02: Technical approach defined (see architecture doc)

   **Deliverables**:
   - User story: "Agent creates task via routing service"
   - Technical approach: REST API with TypeScript service
   ```
   - Expected outcome: Use these outputs directly without questioning

2. **Implement Based on Validated Outputs**:
   - ✅ **DO**: Read previous phase outputs and implement directly
   - ✅ **DO**: Validate current phase against its own criteria
   - ❌ **DON'T**: Re-analyze or question validated previous phase work
   - ❌ **DON'T**: Create additional validation layers
   - Rationale: Reduces cognitive load, enables rapid execution, creates baseline for improvement

3. **Focus on Current Phase Only**:
   - Trust that design is complete and correct
   - Focus effort on implementation success criteria
   - Only revisit previous phase if explicit bug found
   - Success indicator: Steady forward progress without re-work

### Step 3: Apply Four-Level Completion Framework

Systematic completion at Phase, Task, Epic, and Milestone levels.

1. **Level 1: Phase Completion**:

   **Trigger**: All Success Criteria (Success Criteria) within phase complete

   **Required Actions**:
   - Update issue body checkboxes: Mark all Success Criteria as `- [x]`
   - Add phase completion comment with evidence summary
   - Optional: Work log entry for strategic insights

   **Example**:
   ```markdown
   ## Implementation Phase Complete - Routing Service Implementation

   **Evidence Summary**:
   - ✅ Implementation.SC01: Pattern matching engine implemented (commit 7a3d8f2)
   - ✅ Implementation.SC02: Instruction file parsing working (commit b4e91c5)
   - ✅ Implementation.SC03: Confidence scoring functional (commit c2d4e6f)

   **Implementation Highlights**:
   - Used glob patterns for applies_to matching
   - Confidence scoring based on context keyword matching + priority weighting
   - Returns top 3 matches with rationale
   ```
   - Expected outcome: Clear evidence phase objectives met

2. **Level 2: Task Completion**:

   **Trigger**: ALL Acceptance Criteria (Acceptance Criteria) AND Completion Validation (Completion Validation) complete

   **Required Actions**:
   - Verify ALL Acceptance Criteria marked complete
   - Verify ALL Completion Validation marked complete
   - Add task completion comment with summary
   - Work log entry documenting outcomes
   - Close issue with "Closes #X" in final commit

   **Completion Validation (Completion Validation) Requirements**:
   - [ ] All code changes committed and pushed
   - [ ] All tests passing (100% deterministic pass rate)
   - [ ] Documentation updated
   - [ ] No breaking changes introduced
   - [ ] Integration validated with dependent services

   **Example**:
   ```markdown
   ## Task Complete - Routing Service Pattern Matching

   **All Acceptance Criteria Met**:
   - ✅ Design.AC01: Pattern matching functional
   - ✅ Implementation.AC01: Integration with knowledge system
   - ✅ Validation.AC01: Error handling implemented

   **All Completion Validation Passed**:
   - ✅ Completion.CV01: All tests passing (247/247)
   - ✅ Completion.CV02: Documentation updated (API docs, README)
   - ✅ Completion.CV03: Integration test with audit service passing

   Closes #42
   ```
   - Integration point: Maps to trust-based phase execution completion gates

3. **Level 3: Epic Completion**:

   **Trigger**: ALL Epic tasks complete (Epic Task X/X)

   **Required Actions**:
   - Verify all Epic tasks closed (Task 1/4 through Task 4/4)
   - Add Epic completion comment summarizing progression
   - Work log entry with Epic outcomes and learnings
   - Close Epic issue

   **Example**:
   ```markdown
   ## Epic Complete - [Epic]-routing_service

   **All Tasks Completed**:
   - ✅ [Task]-pattern_matching_engine (#42)
   - ✅ [Task]-confidence_scoring (#45)
   - ✅ [Task]-knowledge_system_integration (#48)
   - ✅ [Task]-performance_optimization (#51)

   **Epic Outcomes**:
   - Routing service functional and integrated
   - Average routing time: 12ms (target: <50ms)
   - Confidence accuracy: 94% on test suite

   **Key Learnings**:
   - Glob pattern matching faster than regex for applies_to
   - Caching instruction file metadata critical for performance
   - Need versioning strategy for breaking instruction format changes
   ```
   - Success indicator: Complete Epic delivered, learnings captured

4. **Level 4: Milestone Completion**:

   **Trigger**: ALL Tasks/Epics in milestone complete

   **Required Actions**:
   - Verify all milestone issues closed
   - Create milestone retrospective document
   - Comprehensive work log entry
   - Close milestone with strategic summary

   **Example**:
   ```markdown
   ## Milestone Complete - Project Foundation (v0.1)

   **Scope Delivered**:
   - ✅ [Epic]-routing_service - Agent context matching
   - ✅ [Epic]-audit_service - Event capture & storage
   - ✅ [Task]-docker_compose_configuration
   - ✅ [Task]-typescript_service_standards

   **Strategic Outcomes**:
   - Core agent infrastructure operational
   - Foundation for bounded autonomy established
   - Knowledge routing enables context-aware agent behavior

   **Retrospective Highlights**:
   - Time-free scoping worked well, no deadline pressure
   - Deterministic validation prevented agent confusion
   - Need better cross-service testing strategy for v0.2
   ```
   - Expected outcome: Milestone value delivered, organizational learning captured

### Step 4: Validate Against Quality Gates

Ensure work meets completion criteria before marking complete.

1. **Phase Level Quality Gates**:
   - [ ] All Success Criteria items completed
   - [ ] Phase completion comment added with evidence
   - [ ] Evidence artifacts documented (commits, files, etc.)
   - [ ] No open questions or unresolved issues in phase scope
   - Expected outcome: Phase demonstrably complete

2. **Task Level Quality Gates**:
   - [ ] All Acceptance Criteria items completed
   - [ ] All Completion Validation items completed
   - [ ] All tests passing (deterministic validation)
   - [ ] Documentation updated (code docs, user docs, architecture docs)
   - [ ] Work log entry created
   - [ ] No breaking changes or regressions introduced
   - Success indicator: Task fully implemented, tested, and documented

3. **Epic Level Quality Gates**:
   - [ ] All Epic tasks (1/X through X/X) completed
   - [ ] Epic success criteria met (from Epic description)
   - [ ] Epic outcomes documented
   - [ ] Lessons learned captured
   - [ ] Cross-cutting concerns addressed (security, performance, observability)
   - Integration point: Epic validation ensures comprehensive feature delivery

4. **Milestone Level Quality Gates**:
   - [ ] All milestone issues closed
   - [ ] Milestone objectives achieved
   - [ ] Retrospective completed
   - [ ] Strategic learnings documented
   - [ ] Foundation prepared for next milestone
   - Expected outcome: Major capability increment delivered

### Step 5: Document Completion with Evidence

Provide concrete evidence of completion, not just assertions.

1. **Evidence Summary Format**:
   ```markdown
   **Evidence Summary**:
   - ✅ SC01: [What was completed] ([specific evidence: commit, file, test])
   - ✅ SC02: [What was completed] ([specific evidence])
   - ✅ SC03: [What was completed] ([specific evidence])
   ```
   - Rationale: Enables verification and learning capture

2. **Link Artifacts**:
   - Commit SHAs for code changes
   - File paths for created/modified files
   - Test results for validation
   - Deployment logs for operational changes
   - Success indicator: Any reviewer can verify completion independently

3. **Highlight Key Decisions**:
   - Implementation approach chosen and why
   - Trade-offs made
   - Technical debt incurred (with rationale)
   - Expected outcome: Future maintainers understand context

## Examples

### Example 1: Phase Completion for Routing Service

**Context**: Completing Implementation Phase (Implementation) for routing service pattern matching

**Scenario**: All implementation Success Criteria met, ready to mark phase complete

```markdown
## Implementation Phase Complete - Pattern Matching Implementation

**Evidence Summary**:

- ✅ Implementation.SC01: Glob pattern matching implemented
  - File: `src/services/routing/pattern-matcher.ts`
  - Commit: 7a3d8f2
  - Test coverage: 24 tests passing

- ✅ Implementation.SC02: Confidence scoring algorithm implemented
  - File: `src/services/routing/confidence-scorer.ts`
  - Commit: b4e91c5
  - Test coverage: 18 tests passing

- ✅ Implementation.SC03: Error handling for missing files implemented
  - File: `src/services/routing/error-handler.ts`
  - Commit: c2d4e6f
  - Test coverage: 12 tests passing

**Implementation Highlights**:

- Chose glob over regex for 3x performance improvement
- Confidence scoring uses weighted factors: context match (40%), priority (30%), domain match (30%)
- Graceful degradation returns template when no matches found

**Next Phase**: validation - Integration Testing
```

**Expected Result**: Clear evidence phase is complete, foundation established for next phase

### Example 2: Task Completion for Audit Service

**Context**: Completing entire task for audit event logging implementation

**Scenario**: All phases complete, all acceptance criteria met, all completion validation passed

```markdown
## Task Complete - Audit Event Logging Implementation

**All Phases Complete**:
- ✅ Design Phase: Requirements & Design
- ✅ Implementation Phase: Implementation
- ✅ Validation Phase: Testing & Validation
- ✅ Completion Phase: Documentation

**All Acceptance Criteria Met**:
- ✅ Design.AC01: Event schema designed and documented
- ✅ Implementation.AC01: Event capture service implemented
- ✅ Implementation.AC02: Event storage (PostgreSQL) integrated
- ✅ Validation.AC01: Unit tests passing (156/156)
- ✅ Validation.AC02: Integration tests passing (42/42)

**All Completion Validation Passed**:
- ✅ Completion.CV01: All code committed (commits 3a2b1c through 9d8e7f)
- ✅ Completion.CV02: All tests passing deterministically (10 consecutive runs)
- ✅ Completion.CV03: API documentation updated (docs/api/audit-service.md)
- ✅ Completion.CV04: Integration with routing service validated

**Key Metrics**:
- Event capture latency: avg 3ms, p99 8ms
- Storage reliability: 100% (no lost events in testing)
- API response time: avg 12ms

Closes #45
```

**Expected Result**: Task fully complete, all quality gates passed, ready for production

**Trade-offs**: More documentation overhead, but provides complete verification trail

### Example 3: Trusting Previous Phase Outputs

**Context**: Starting Validation Phase (Testing) after Implementation Phase (Implementation) is complete

**Scenario**: Agent reads implementation outputs and proceeds with testing without re-analyzing implementation decisions

```markdown
## Starting Validation Phase - Testing & Validation

**Reading Implementation Phase Outputs** (marked complete):

From implementation completion comment:
- Implementation: Pattern matching using glob library
- Confidence scoring: 3-factor weighted algorithm
- Error handling: Graceful degradation to template

**Proceeding with Testing** (trusting implementation decisions):

Validation.SC01: Create test suite for pattern matching
- Test glob patterns match expected files ✓
- Test edge cases (no matches, multiple matches) ✓
- Test performance (target: <50ms per route) ✓

Validation.SC02: Validate confidence scoring
- Test known contexts produce expected scores ✓
- Test score ordering (higher confidence first) ✓
- Test boundary conditions (0.0 to 1.0 range) ✓

**NOT re-analyzing**:
- ✗ Should we use regex instead of glob? (implementation decision, trust it)
- ✗ Should confidence algorithm be different? (implementation decision, trust it)
- ✗ Should error handling be different? (implementation decision, trust it)

**Focus**: Test what was implemented in implementation, validate it works per its design
```

**Expected Result**: Rapid progress on validation without re-work, implementation decisions trusted as foundational truth

## Validation Checklist

Complete before marking any level as done:

### Phase Completion
- [ ] All Success Criteria items have `- [x]` checkboxes
- [ ] Phase completion comment added with evidence summary
- [ ] Evidence artifacts linked (commits, files, tests)
- [ ] No unresolved issues within phase scope
- [ ] Implementation highlights documented

### Task Completion
- [ ] All phases marked complete
- [ ] All Acceptance Criteria items have `- [x]` checkboxes
- [ ] All Completion Validation items have `- [x]` checkboxes
- [ ] All tests passing (deterministic 100% pass rate)
- [ ] Documentation updated (code, API, user, architecture)
- [ ] Work log entry created with outcomes
- [ ] Issue closed with "Closes #X" in commit

### Epic Completion
- [ ] All Epic tasks (1/X through X/X) closed
- [ ] Epic success criteria met (from Epic description)
- [ ] Epic completion comment with progression summary
- [ ] Work log entry with Epic outcomes and learnings
- [ ] Cross-cutting concerns validated (security, performance, etc.)
- [ ] Epic issue closed

### Milestone Completion
- [ ] All milestone issues closed
- [ ] Milestone objectives achieved
- [ ] Retrospective document created
- [ ] Comprehensive work log entry
- [ ] Strategic learnings documented
- [ ] Milestone closed with strategic summary

## Common Pitfalls

### Pitfall 1: Partial Context Reading

- ❌ **Problem**: Using head/tail/truncation to "quickly check" files during development
- **Why it happens**: Perceived time savings, but creates knowledge gaps
- ✅ **Solution**: Always read complete files or use proper pagination
- **Example**: Reading only first 100 lines of instruction file misses critical edge cases documented later

### Pitfall 2: Re-Validating Completed Phases

- ❌ **Problem**: Re-analyzing work that already passed Success Criteria/AC##/CV##
- **Why it happens**: Lack of trust in previous phase outputs
- ✅ **Solution**: Trust validated outputs, focus on current phase criteria
- **Example**: Re-debating architecture decisions during testing phase instead of testing the implemented architecture

### Pitfall 3: Premature Completion

- ❌ **Problem**: Marking phase/task complete before all criteria met
- **Why it happens**: Pressure to show progress, incomplete understanding of criteria
- ✅ **Solution**: Verify all checkboxes before declaring complete, use quality gate checklist
- **Example**: Marking Implementation.SC03 complete when error handling only covers 2/5 error cases

### Pitfall 4: Missing Documentation

- ❌ **Problem**: Completing work without work log entries or completion comments
- **Why it happens**: Focus on implementation, documentation feels like overhead
- ✅ **Solution**: Document evidence and outcomes at each level - enables learning
- **Example**: Closing task without documenting key implementation decisions and trade-offs

### Pitfall 5: Incomplete Evidence

- ❌ **Problem**: Completion comment says "done" without linking artifacts
- **Why it happens**: Treating completion as assertion rather than verification
- ✅ **Solution**: Link specific commits, files, tests, metrics as evidence
- **Example**: "Implementation.SC01 complete" vs "Implementation.SC01 complete (commit 7a3d8f2, file pattern-matcher.ts, 24 tests passing)"

## Edge Cases

### Edge Case 1: Discovering Issues in Previous Phase

**When**: During validation (Testing), discover bug in implementation (Implementation)

**Approach**:
- Document the bug clearly (what, where, impact)
- Fix the bug in current phase if minor
- If major architectural issue, create new task for proper fix
- Update implementation completion comment noting bug found and fixed
- Don't re-open phase unless fundamentally incomplete

**Example**: During testing, discover pattern matching doesn't handle negation patterns. Add negation support as validation work, document in implementation note.

### Edge Case 2: Scope Expansion Mid-Phase

**When**: While working on Implementation.SC02, realize additional work needed

**Approach**:
- Evaluate if new work fits current Success Criteria
- If yes: Update SC description to reflect expanded scope
- If no: Create new SC (Implementation.SC04) or defer to future task
- Document scope expansion in phase notes
- Update estimates if relevant (for time-free scoping: complexity)

**Example**: Implementation.SC02 "Implement confidence scoring" expands to include caching layer for performance. Update SC02 to include caching.

### Edge Case 3: Blocked Phase Completion

**When**: Implementation.SC03 blocked by external dependency (API not ready)

**Approach**:
- Document blocker clearly in phase notes
- Mark SC03 as blocked (not complete)
- Continue with non-blocked work (Validation.SC01 if independent)
- Update issue with blocker status and resolution plan
- Don't mark phase complete until blocker resolved

**Example**: Implementation.SC03 requires GitHub MCP integration, but MCP server not deployed. Document blocker, work on other SCs, resolve blocker, complete SC03, then complete phase.

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Confusion about what's complete | Unclear evidence or missing completion comments | Add evidence summary with specific artifacts linked |
| Re-work on validated phases | Not trusting previous phase outputs | Document in phase notes "design validated, trusting outputs", focus on current phase |
| Premature completion claims | Misunderstanding completion criteria | Review quality gate checklist before marking complete |
| Missing learnings | No work log entries or completion summaries | Make completion comment mandatory, include implementation highlights |
| Incomplete validation | Only some CV items checked | Require ALL Completion Validation items checked before task can close |
| Progress stalls | Reading incomplete context | Always read complete files/issues before making decisions |

## Related Instructions

- **See also**: [trust_based_task_execution.instructions.md](./trust_based_task_execution.instructions.md) - Complete Success Criteria/AC##/CV## framework this workflow builds on
- **Prerequisites**: [feature_development.instructions.md](./feature_development.instructions.md) - How features map to phases and tasks
- **See also**: [task_creation_workflow.instructions.md](../project_management/task_creation_workflow.instructions.md) - Creating properly structured tasks this workflow completes
- **See also**: [deterministic_validation_framework.instructions.md](../validation/deterministic_validation_framework.instructions.md) - Validation standards for Completion Validation completion
- **See also**: Project Glossary - Authoritative source for PM terminology (Epic, Task, Sub-Task, Sub-Issue, Milestone)
- **See also**: [Glossary Maintenance](../project_management/glossary_maintenance.instructions.md) - Keeping glossary current and complete

---

**Success Criteria**: All development work maintains complete context, trusts validated phases, follows four-level completion framework with evidence-based progress tracking, and meets quality gates at each level.

**Confidence Check**: Are you reading complete files or using partial reads? Do you trust previous phase outputs or re-analyze them? Is completion backed by evidence or just assertions?
