---
pongogo_instruction_spec: "0.0.2"
title: "Feature Development Standards"
description: "Feature development standards including design-first approach and quality gates."
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
      - feature_development
      - SC_AC_CV
      - success_criteria
      - acceptance_criteria
      - completion_validation
      - autonomy_ladder
      - phase_completion
      - propose_patch_apply
      - quality_gates
      - trust_execution
    nlp: "Phase-based feature development with SC/AC/CV validation gates implementing autonomy ladder (propose→patch→apply) and trust-based execution"
evaluation:
  success_signals:
    - SC items completed with evidence before AC validation
    - AC items verified after all SC complete
    - CV requires all AC across entire task
    - Phase completion includes checkbox + comment + work log
    - Autonomy level matches complexity assessment
  failure_signals:
    - AC checked before all SC complete
    - CV checked with pending AC items
    - Evidence missing for checked items
    - Phase marked complete without reporting deliverables
    - Re-analyzing trusted previous phase outputs
---


# Feature Development Standards

**Purpose**: Define phase-based feature development lifecycle with SC/AC/CV validation gates implementing autonomy ladder.

**Philosophy**: Quality gates at each development stage ensure systematic validation without requiring post-completion re-verification.

---

## When to Apply

Use phase-based feature development when:

- Implementing new features or significant changes
- Working through multi-phase work items
- Validating work before phase progression
- Determining appropriate agent autonomy levels
- Coordinating work across feature team agents

---

## Quick Reference

**SC → AC → CV Workflow Patterns**:

**1. Phase Item Types** (Sequential Execution):
```
Phase P##:
├─ Working Memory (WM) - Narrative context, no checkboxes
├─ Implementation Priorities (IP) - Ordering decisions, no checkboxes
├─ Success Criteria (SC) - Deliverables, checkboxes with evidence
│  └─ Complete ALL SC before proceeding to AC
├─ Acceptance Criteria (AC) - Quality validation, checkboxes after SC
│  └─ Complete ALL AC before proceeding to CV
└─ Completion Validation (CV) - Operational readiness, checkboxes after AC
   └─ CV requires ALL AC across ENTIRE task (not just current phase)
```

**2. Success Criteria (SC) Execution**:
```markdown
- [ ] Design.SC01: [Deliverable description]
- [ ] Design.SC02: [Deliverable description]

Workflow:
1. Implement deliverable
2. Capture evidence (commit SHA, file path, test result)
3. Update checkbox: - [x] Design.SC01
4. Add comment if approach differs from plan
```

**3. Acceptance Criteria (AC) Execution**:
```markdown
Wait until ALL SC items checked ✓

- [ ] Design.AC01: [End-to-end validation]
- [ ] Design.AC02: [Quality check]

Workflow:
1. Verify all Design.SC## checked
2. Perform end-to-end validation
3. Document results in issue comment
4. Update checkboxes only if validation passes
5. Create work log entry
```

**4. Completion Validation (CV) Execution**:
```markdown
Wait until ALL AC items across ENTIRE task checked ✓

- [ ] Completion.01: All code committed and pushed
- [ ] Completion.02: All tests passing (100% deterministic)
- [ ] Completion.03: Documentation updated
- [ ] Completion.04: No breaking changes
- [ ] Completion.05: Integration validated with dependent services

Workflow:
1. Verify ALL Acceptance Criteria across entire task checked
2. Perform operational validation
3. Document concrete evidence (logs, test results)
4. Update CV checkboxes
5. Create work log entry
```

**5. Autonomy Ladder Mapping** (SC → AC → CV = Propose → Patch → Apply):
- **Simple Complexity**: Apply autonomy → Post-application review
- **Moderate Complexity**: Patch autonomy → Pre-merge approval
- **Complex Complexity**: Propose autonomy → Architecture approval before implementation

**6. Phase Completion Workflow**:
```bash
# 1. Update issue body checkboxes
- [x] Design.SC01, Design.SC02, Design.SC03

# 2. Add phase completion comment
"## Design Phase Complete
Evidence Summary:
- ✅ Design.SC01: [what] (commit abc123)
- ✅ Design.SC02: [what] (commit def456)"

# 3. Optional: Work log entry for strategic insights
```

**7. Common Sequential Violations** (AVOID):
- ❌ Checking AC before all SC complete → Premature validation
- ❌ Checking CV before all AC complete → Skipping quality gates
- ❌ Checking CV with AC items pending in other phases → Incomplete task validation
- ✅ **ALWAYS**: Complete SC → then AC → then CV sequentially

---

## Core Principles

- **Trust Completed Phases**: Phases with all SC/AC/CV items checked are trustworthy, implement without re-analysis
- **Phase Validation Gates**: SC (deliverables) � AC (quality) � CV (operational) provide systematic validation
- **Sequential Execution**: Complete SC items before AC, complete all AC before CV
- **Evidence Required**: Every checked item must have evidence (commit, PR, test result, work log)
- **Autonomy Ladder Mapping**: SC�AC�CV gates map to propose�patch�apply autonomy levels

## Step-by-Step Guidance

### 1. **Understand Phase Structure**
   - Working Memory (WM): Strategic context and prerequisites (narrative prose, no checkboxes)
   - Implementation Priorities (IP): Execution ordering decisions (narrative prose, no checkboxes)
   - Success Criteria (SC): Deliverable implementation milestones (checkboxes with evidence)
   - Acceptance Criteria (AC): End-to-end quality validation (checkboxes after all SC complete)
   - Completion Validation (CV): Operational readiness verification (checkboxes after all AC complete)
   - Validation Tasks (V): Optional quality checks (excluded from completion calculation)
   - Expected outcome: Clear understanding of phase item types and sequencing

### 2. **Execute Success Criteria Items**
   - Implement deliverable described in SC item
   - Capture evidence immediately (commit, PR, or work log entry)
   - Update checkbox from `- [ ]` to `- [x]`
   - Add comment if approach differs from plan
   - Expected outcome: Deliverables complete with evidence

### 3. **Execute Acceptance Criteria Items**
   - Verify all SC items checked before starting AC validation
   - Perform end-to-end validation from user perspective
   - Document validation results in issue comment
   - Update AC checkboxes only if validation passes
   - Create work log entry documenting validation
   - Expected outcome: Quality validated across complete phase

### 4. **Execute Completion Validation Items**
   - Verify all AC items across ENTIRE task checked (not just current phase)
   - Perform operational validation with concrete evidence
   - Document operational readiness (logs, test results, deployment verification)
   - Update CV checkboxes with evidence
   - Create work log entry for operational validation
   - Expected outcome: Operational readiness verified and documented

### 5. **Complete Phase Reporting**
   - Update issue body checkboxes (single source of truth)
   - Add phase completion comment (evidence, validation outcomes, artifacts)
   - Create work log entry (phase identifier, outcomes, follow-ups)
   - Expected outcome: All three reporting deliverables complete

## Examples

### Example 1: API Endpoint Development

Context: Adding new endpoint following SC�AC�CV gates (propose�patch�apply)

```markdown
## Design Phase: Implementation (Simple Complexity � Apply Autonomy)

### Success Criteria (Deliverable Implementation)
- [ ] Design.SC01: GET /api/instructions endpoint created
- [ ] Design.SC02: File path glob matching implemented
- [ ] Design.SC03: Response formatting with instruction metadata

### Workflow:
1. Implement SC01: Create endpoint handler
   - Evidence: Commit abc123 "Add GET /api/instructions endpoint"
   - Update: - [x] Design.SC01

2. Implement SC02: Add glob matching logic
   - Evidence: Commit def456 "Implement file path glob matching"
   - Update: - [x] Design.SC02

3. Implement SC03: Format response
   - Evidence: Commit ghi789 "Add instruction metadata to response"
   - Update: - [x] Design.SC03

### Acceptance Criteria (End-to-End Quality)
Wait until ALL SC items checked

- [ ] Design.AC01: Endpoint returns correct instructions for valid paths
- [ ] Design.AC02: Invalid paths return appropriate error responses

### Workflow:
1. Verify all SC complete:  Design.SC01, Design.SC02, Design.SC03
2. Test end-to-end:
   - Valid path � instructions returned
   - Invalid path � 404 error
3. Document in issue comment:
   - Test scenarios executed
   - Validation outcomes
   - Edge cases verified
4. Update: - [x] Design.AC01, - [x] Design.AC02
5. Work log entry: "design validation complete, all AC criteria met"
```

**Context**: Simple endpoint following established patterns (Apply autonomy level)
**Expected Result**: Systematic validation through SC�AC gates, evidence captured

### Example 2: Sequential Execution Preventing Premature Checking

Context: Avoiding common workflow mistakes

```markdown
## L WRONG: Checking AC Before SC Complete

Implementation Phase:
- [x] Implementation.SC01: Authentication middleware implemented
- [ ] Implementation.SC02: Password hashing integrated (STILL IN PROGRESS)
- [x] Implementation.AC01: Users can authenticate � PREMATURE! SC02 not done

Problem:
- AC validation requires all deliverables (SC items)
- Checking AC before SC complete breaks sequential workflow
- Cannot validate end-to-end when deliverables incomplete

##  CORRECT: Sequential SC � AC Execution

Implementation Phase:
- [x] Implementation.SC01: Authentication middleware (commit abc123)
- [x] Implementation.SC02: Password hashing (commit def456)
- [x] Implementation.AC01: Authentication validated (comment with test results)

Workflow:
1. Complete ALL SC items first
2. Capture evidence for each SC
3. THEN perform AC validation
4. Document AC validation in comment
5. Check AC boxes only after validation passes
```

**Context**: Enforcing sequential workflow for systematic validation
**Expected Result**: Proper sequencing ensures quality gates work correctly

### Example 3: Autonomy Ladder Mapping

Context: Different complexity levels map to different autonomy and approval gates

```markdown
## Simple Complexity � Apply (Bounded Autonomy)
**Task**: Add standard CRUD endpoint

SC (Propose Design):
- Endpoint follows REST conventions
- Standard error handling
- Existing auth middleware

AC (Patch Implementation):
- Integration tests pass
- API documentation updated
- Error responses validated

CV (Apply with Post-Review):
- Deployed to staging
- Smoke tests pass
- Post-apply review scheduled

**Approval**: Post-application review (agent can apply directly)

---

## Moderate Complexity � Patch (Supervised Autonomy)
**Task**: Implement instruction routing service

SC (Propose Design):
- Glob matching algorithm
- Caching strategy
- Performance requirements

AC (Patch Implementation):
- Pattern matching tested
- Cache invalidation works
- Performance benchmarks met

CV (Pre-Apply Approval):
- Integration tests complete
- Documentation comprehensive
- Pre-merge review approval required

**Approval**: Technical review before merge (supervised implementation)

---

## Complex Complexity � Propose (Design Autonomy)
**Task**: Design autonomy ladder architecture

SC (Propose Design):
- Approval gate mechanisms
- Rollback strategies
- Security model

AC (Design Validation):
- Architecture review approved
- Security implications assessed
- Rollback procedures tested

CV (Architecture Approval):
- Design document complete
- Stakeholder approval
- Implementation plan validated

**Approval**: Architecture review before implementation (design only, human implements)
```

**Context**: Autonomy ladder with graduated trust levels
**Expected Result**: Appropriate approval gates for complexity and risk

## Validation Checklist

Before marking phase complete:

- [ ] All SC items checked with evidence (commits, PRs, work log)
- [ ] All AC items checked with validation documentation
- [ ] CV items checked if final phase (operational validation documented)
- [ ] Phase completion comment added to issue
- [ ] Work log entry created
- [ ] No premature checking (SC before AC before CV)
- [ ] Trust-based execution followed (no re-analysis of previous phases)

## Common Pitfalls

### Pitfall 1: Checking Items Without Evidence

- L **Problem**: Checking SC/AC/CV boxes without commits, tests, or documentation
- **Why it happens**: Treating checkboxes as to-do list instead of evidence tracking
-  **Solution**: Capture evidence BEFORE checking box (commit first, then check)
- **Example**: Empty checkbox check � Commit abc123, THEN check box

### Pitfall 2: Premature AC Validation

- L **Problem**: Checking AC items before all SC items complete
- **Why it happens**: Not understanding sequential workflow requirement
-  **Solution**: Complete ALL SC items first, THEN perform AC validation
- **Example**: 2/3 SC complete but AC checked � Finish SC03, THEN validate AC

### Pitfall 3: Skipping Phase Completion Reporting

- L **Problem**: Marking phase complete without issue comment and work log entry
- **Why it happens**: Focus on implementation, documentation feels like overhead
-  **Solution**: All three required: checkbox update + comment + work log
- **Example**: Only checkbox updated � Add completion comment + work log entry

### Pitfall 4: CV Items Before All AC Complete

- L **Problem**: Checking CV items when AC items in other phases still pending
- **Why it happens**: Misunderstanding CV applies to entire task, not just final phase
-  **Solution**: CV requires ALL AC across ALL phases complete
- **Example**: Validation.AC incomplete but Completion. checked � Complete Validation.AC first

## Edge Cases

### Edge Case 1: Discovery of Missing SC Items During Implementation

**When**: Implementation reveals necessary deliverable not in original SC list
**Approach**:
- Add new SC item to phase with clear description
- Mark as discovered during implementation
- Capture evidence and check when complete
- Document in phase completion comment
- Update templates if pattern emerges

**Example**: implementation implementation reveals logging needed � Add Implementation.SC04: Request logging integrated, implement, document discovery

### Edge Case 2: AC Validation Fails

**When**: End-to-end validation reveals quality issues
**Approach**:
- Do NOT check AC item
- Document validation failure in comment
- Identify root cause (which SC item has issue)
- Fix implementation, re-validate
- Only check AC when validation passes

**Example**: Implementation.AC01 fails (auth returns wrong token) � Debug Implementation.SC02 (token generation), fix, re-validate, then check AC

### Edge Case 3: Cross-Agent Phase Handoffs

**When**: One agent completes phase, another continues
**Approach**:
- First agent completes all phase reporting (checkbox + comment + work log)
- Second agent reads phase outputs, trusts completion
- Second agent implements next phase per previous phase recommendations
- Handoff documented in both agents' work logs
- No re-validation of previous agent's work

**Example**: PM agent completes analysis analysis � Engineer agent reads analysis outputs, trusts analysis, implements design per analysis recommendations

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| AC checked but SC incomplete | Sequential workflow violated | Complete all SC first, then re-validate AC |
| No evidence for checked items | Evidence capture skipped | Add commits/PRs/comments, update issue with evidence |
| CV checked but AC pending | Misunderstanding CV scope | CV requires ALL AC complete across entire task |
| Phase marked complete without report | Reporting requirements skipped | Add completion comment + work log entry |
| Re-analyzing previous phase | Trust principles violated | Read phase outputs, trust, implement directly |

## Related Instructions

- **See also**: [trust_based_task_execution.instructions.md](./trust_based_task_execution.instructions.md) - Trust framework ensuring phase outputs are trustworthy
- **Prerequisites**: [time_free_project_management.instructions.md](../project_management/time_free_project_management.instructions.md) - Complexity-based sizing guiding autonomy levels
- **Next steps**: [development_workflow_essentials.instructions.md](./development_workflow_essentials.instructions.md) - Additional workflow patterns for complete development lifecycle

---

**Success Criteria**: Features developed through systematic phase progression with SC�AC�CV validation gates, evidence captured for all items, appropriate autonomy levels applied, and trust-based execution followed.

**Confidence Check**: Are SC items complete before AC validation? Is evidence captured for every checked item? Are phases trusted without re-analysis? Does complexity determine autonomy level?
