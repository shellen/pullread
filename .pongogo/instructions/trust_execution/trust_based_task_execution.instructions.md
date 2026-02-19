---
pongogo_instruction_spec: "0.0.2"
title: "Trust-Based Task Execution"
description: "Trust-based task execution framework for bounded autonomous work with approval paths."
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
      - trust_execution
      - trust_based
      - prerequisite_work
      - acceptance_criteria
      - success_indicators
      - completed_work
      - trust_protocol
      - re-analysis
      - meta-system_improvement
      - task_validation
    nlp: "Trust framework ensuring agents trust completed prerequisite work, leverage validation safeguards without re-analysis, and improve meta-system forward"
evaluation:
  success_signals:
    - Prerequisite work trusted without re-analysis
    - Verification checklist completed before proceeding
    - Implementation follows recommendations directly
    - Learnings captured for meta-system improvement
  failure_signals:
    - Re-analyzing completed work unnecessarily
    - Starting dependent work with incomplete prerequisites
    - Proposing alternative approaches instead of implementing recommendations
    - Questioning past work instead of improving forward
---


# Trust-Based Task Execution

**Purpose**: Establish trust framework ensuring agents trust completed prerequisite work (Tasks/Sub-Tasks) and leverage validation safeguards (Acceptance Criteria, Success Indicators) without re-analysis.

**Philosophy**: Completed work is trustworthy through systematic validation during execution (via Acceptance Criteria checkboxes), not after completion.

---

## When to Apply

Use trust-based task execution when:

- Starting any new Task or Sub-Task that depends on completed prerequisite work
- Implementing recommendations from completed analysis or design work
- Validating current work against previous Task/Sub-Task outputs
- Designing meta-system improvement processes
- Coordinating work across multiple agents in feature team

---

## Quick Reference

**Key Trust Decision Criteria**:

**1. Is Prerequisite Work Trustworthy?** (Verification Checklist):
- [ ] All Acceptance Criteria checkboxes completed
- [ ] Success Indicators achieved
- [ ] Task/Sub-Task marked as complete with closing comment
- [ ] Work log entry documents completion
- [ ] Deliverables accessible and readable (docs, commits, artifacts)

**If ALL checked**: ✅ TRUST THE WORK → Proceed with dependent task
**If ANY missing**: ⚠️ COMPLETE PREREQUISITE WORK FIRST → Don't start current task

**2. Trust vs Re-Analysis Decision Tree**:
```
Starting dependent work?
├─ Prerequisite complete (all checkboxes)? NO → Complete prerequisites first
├─ Prerequisite complete? YES
   ├─ Do you understand the outputs? NO → Read carefully, ask for clarification
   ├─ Do you understand the outputs? YES
      ├─ Do outputs seem "unclear"? → Re-read for comprehension, TRUST when clarified
      └─ Outputs clear? → ✅ TRUST outputs, implement directly
```

**3. When to TRUST (Proceed Directly)**:
- ✅ Prerequisite work has all Acceptance Criteria checked
- ✅ Task closing comment provides evidence of completion
- ✅ Recommendations/outputs are explicit and actionable
- ✅ You understand what to implement
- **Action**: Read outputs, implement per recommendations

**4. When to QUESTION (Block Progress)**:
- ❌ Prerequisite work missing Acceptance Criteria checkboxes
- ❌ No closing comment or work log entry
- ❌ Deliverables not accessible
- ❌ Fundamental completion criteria not met
- **Action**: Return to prerequisite work, complete properly

**5. Common Trust Anti-Patterns** (AVOID):
- ❌ "Let me verify the analysis before implementing..." → Re-analysis
- ❌ "Should we reconsider the approach from that Task?" → Undermining validated work
- ❌ "Building extra validation layer to cross-check completed work..." → Distrust of Acceptance Criteria gates
- ❌ "This seems unclear, let me re-analyze..." → Excuse for re-doing work

**6. Meta-System Improvement vs Re-Validation**:
- ✅ **DO**: "Task met all criteria. Enhance Acceptance Criteria templates for future work based on this learning."
- ❌ **DON'T**: "Task wasn't really complete. Add more validation before marking work complete."
- **Principle**: Improve forward, don't doubt backward

**7. Correction Signals During Execution** (NEW - Routing IMP-018):

Trust applies to COMPLETED prerequisite work, not current execution. When users signal corrections during active work:

**Correction Signals** (PAUSE immediately):
- "wait, hold on" - User has new information
- "that's not what I" - Expectation mismatch
- "sorry, actually" - User changing direction
- "you're skipping" - Missing something important

**Correct Response**:
1. STOP current action
2. Acknowledge: "Let me pause here"
3. Clarify: "What should I do differently?"
4. Resume with corrected understanding

**Why This Isn't Distrust**:
- Trusting completed work ≠ ignoring user feedback
- Correction signals are NEW information, not re-analysis
- Responding to corrections prevents friction

---

## Core Principles

- **Trust Is Built-In**: Acceptance Criteria and Success Indicators validate quality DURING work, not after completion
- **Linear Task Progression**: Dependent work trusts prerequisite Task/Sub-Task outputs without re-analysis
- **Built-In Safeguards**: Acceptance Criteria checkboxes eliminate need for re-validation
- **Cross-Session Trust**: Trust extends across sessions through verification efficiency protocols
- **Improvement Over Re-Validation**: Analyze to make future work better, not question past work validity

## Step-by-Step Guidance

### 1. **Verify Prerequisites Complete**
   - Identify prerequisite work: Which Tasks/Sub-Tasks must complete before this work?
   - Check completion status: Are all Acceptance Criteria checkboxes checked?
   - Locate deliverables: Where are outputs (documents, commits, artifacts)?
   - Confirm work log entry exists: Is completion documented?
   - Expected outcome: Prerequisites validated, ready to proceed

### 2. **Read and Trust Prerequisite Outputs**
   - Read prerequisite outputs: Analysis documents, recommendations, requirements
   - Trust the content: Do not question validity of completed work
   - Extract actionable items: What does this work tell me to implement?
   - Note dependencies: What relationships exist between recommendations?
   - Expected outcome: Clear understanding of what to implement without re-analyzing

### 3. **Implement Per Recommendations**
   - Follow guidance directly: Implement as specified in prerequisite work
   - Do not redesign: Resist proposing alternative approaches
   - Document deviations: If implementation reveals issues, note as learning
   - Maintain scope: Stay within boundaries defined by prerequisite work
   - Expected outcome: High-fidelity execution matching prerequisite recommendations

### 4. **Validate Current Work**
   - Check Success Indicators: Are deliverables achieving intended outcomes?
   - Verify Acceptance Criteria: Does implementation meet quality thresholds?
   - Complete checkboxes: Mark criteria as met with evidence
   - Do NOT re-validate prerequisite work: Trust their completion validation
   - Expected outcome: Current work validated, prerequisite work remains trusted

### 5. **Document Learnings for Improvement**
   - Capture insights: What worked well? What could be better?
   - Identify meta-system gaps: Where could processes improve?
   - Document for retrospective: Feed into improvement cycle
   - Avoid blame: Focus on system improvement, not past work validation
   - Expected outcome: Learnings captured for meta-system enhancement

## Examples

**Note**: The following examples use old phase notation (analysis/implementation, Success Criteria/AC##/CV##) for illustration. When applying these patterns, substitute:
- "Analysis Task/implementation/testing" → "Prerequisite Task/Sub-Task"
- "Success Criteria" → "Success Indicators"
- "Acceptance Criteria" → "Acceptance Criteria"
- "Completion Validation" → "Acceptance Criteria" (validation merged into AC)
- "Phase completion" → "Task/Sub-Task completion"

### Example 1: Routing Service Implementation

Context: Implementing instruction routing service after analysis phase complete

```markdown
## Analysis Task: Analysis (COMPLETE )
- All SC/AC/CV items checked
- Analysis document: `/docs/routing-service-design.md`
- Recommendations:
  1. Use file path glob matching for instruction selection
  2. Implement LRU cache for routing decisions
  3. Load instructions on-demand, not at startup

## Implementation Task: Implementation (STARTING)

### L WRONG: Re-Analysis Approach
"Let me review the routing options again to see if glob matching is best..."
- Re-analyzing completed analysis work
- Questioning validated recommendations
- Wasting effort, showing distrust

###  CORRECT: Trust-Based Execution
1. Read analysis analysis document � recommendations clear
2. Trust glob matching recommendation � implement as specified
3. Trust LRU cache recommendation � integrate caching library
4. Trust on-demand loading � implement lazy loading pattern
5. Validate implementation implementation � tests pass, integration works
6. Document in work log � "implementation complete per analysis recommendations"

Result:
- Rapid implementation without decision paralysis
- High fidelity to analysis design
- Learnings: LRU cache size needed tuning (meta-system improvement opportunity)
```

**Context**: Multi-phase feature development with autonomy ladder (SC�AC�CV = propose�patch�apply)
**Expected Result**: Trust enables efficient execution, deviations become learnings not failures

### Example 2: Cross-Session Trust with Verification Efficiency

Context: Feature spanning 3 days with architecture document

```markdown
## Session 1: Analysis Phase
- Read architecture.md (verification count: 1)
- Extract: "Microservices with API gateway, event-driven messaging"
- Document in summary: "architecture.md verified - microservices pattern"

## Session 2: Implementation Phase
- Summary states: "architecture.md verified 1x"
- Decision: TRUST summary, DO NOT re-read
- Rationale: No architecture changes, apply microservices patterns
- Implement: Create service following documented pattern

## Session 3: Integration Testing
- Summary states: "architecture.md verified 1x - DO NOT re-verify"
- Decision: TRUST directive, proceed with testing
- Rationale: Verification efficiency protocol, avoid redundancy
- Test: Integration tests using microservices assumptions

Result:
- Verification budget preserved (1x instead of 3x)
- Cognitive load reduced (no re-processing)
- Faster execution (trust replaces re-analysis)
```

**Context**: Trust extends across sessions using verification efficiency protocols
**Expected Result**: Cross-session trust reduces redundancy and cognitive overhead

### Example 3: Meta-System Improvement Without Re-Validation

Context: Post-completion test catches edge case

```markdown
## Scenario: Automated Test Finds Gap

### L WRONG Response: Question Completed Work
"Test caught issue, so implementation wasn't really complete.
Add more validation before marking phases complete."

Problem:
- Questioning completed work that met all criteria
- Adding validation layers instead of improving criteria
- Backward-looking doubt vs forward-looking improvement

###  CORRECT Response: Improve Meta-System
"Test caught edge case not in implementation acceptance criteria.
implementation was complete per SC/AC/CV - now enhance the criteria."

Actions:
1. implementation remains trusted (met all defined criteria)
2. Update AC templates (include edge case category)
3. Add pattern to instructions (document for future)
4. Retrospective entry (capture as improvement opportunity)

Result:
- implementation completion status unchanged
- Meta-system enhanced for future work
- Pattern captured for institutional knowledge
- Learning preserved without blame
```

**Context**: Post-completion validation triggers improvement, not re-validation
**Expected Result**: Continuous improvement without eroding trust foundation

## Validation Checklist

Before trusting prerequisite work:

- [ ] All Success Indicators achieved in prerequisite Task/Sub-Task
- [ ] All Acceptance Criteria checkboxes checked in prerequisite Task/Sub-Task
- [ ] Task/Sub-Task closing comment exists with evidence
- [ ] Work log entry documents completion
- [ ] Deliverables accessible and readable (docs, commits, artifacts)

If ALL items met:  TRUST THE WORK - proceed with dependent task

If ANY items missing: � COMPLETE PREREQUISITE WORK FIRST - don't start current task

## Common Pitfalls

### Pitfall 1: Re-Analyzing Completed Phases

- L **Problem**: Creating validation layers to re-check previous phase work
- **Why it happens**: Lack of confidence in SC/AC/CV validation gates
-  **Solution**: Trust SC/AC/CV gates, read outputs, implement directly
- **Example**: "Let me verify analysis findings" � Read analysis outputs, trust recommendations, implement

### Pitfall 2: Creating Additional Validation Layers

- L **Problem**: Building extra safeguards when SC/AC/CV already exist
- **Why it happens**: Distrust of established meta-system safeguards
-  **Solution**: Use existing gates, focus on current work not previous validation
- **Example**: "Build script to cross-check analysis" � Trust analysis, validate implementation implementation instead

### Pitfall 3: Treating Clear Outputs as "Unclear"

- L **Problem**: Questioning explicit recommendations from completed phases
- **Why it happens**: Excuse for re-analyzing completed work
-  **Solution**: Read carefully, trust explicit guidance, implement per recommendation
- **Example**: "This seems unclear" � Re-read for comprehension, trust when clarified

### Pitfall 4: Suggesting Alternative Approaches

- L **Problem**: Proposing different strategies than previous phase recommended
- **Why it happens**: Undermining systematic planning work
-  **Solution**: Implement per recommendation, document deviations as learnings
- **Example**: "Better approach than analysis" � Implement analysis approach, capture alternative as insight

## Edge Cases

### Edge Case 1: Previous Phase Genuinely Incomplete

**When**: Prerequisite phase missing SC/AC/CV checkboxes or work log entry
**Approach**:
- Do NOT start current phase implementation
- Return to previous phase completion
- Validate previous phase properly
- Only proceed when all completion criteria met
- Document why phase was marked incomplete

**Example**: analysis has 2/3 SC items checked � Complete analysis.SC03, validate, THEN start implementation

### Edge Case 2: Implementation Reveals Design Gap

**When**: Following analysis recommendations reveals unforeseen issue
**Approach**:
- Continue implementation where possible
- Document gap as learning, not failure
- Flag for meta-system improvement
- Do not blame analysis for incomplete analysis
- Update instructions with discovered pattern

**Example**: analysis recommended caching but didn't specify eviction policy � Choose reasonable default, document as AC enhancement opportunity

### Edge Case 3: Cross-Agent Phase Dependencies

**When**: Multiple agents working on related phases
**Approach**:
- Each agent trusts other agents' completed phases
- Coordinate through shared work log and phase outputs
- Do not re-validate other agent's work
- Flag integration issues as coordination improvements
- Document handoff points clearly

**Example**: PM agent completes analysis analysis, Engineer agent implements implementation � Engineer trusts PM's analysis, implements directly

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Agent re-analyzing completed phase | Trust anti-pattern violation | Review trust principles, read outputs and implement directly |
| Multiple validation layers proposed | Distrust of SC/AC/CV gates | Use existing gates, focus resources on current work |
| Slow progress due to paralysis | Decision paralysis from distrust | Trust validated plans, execute faithfully to create learning baseline |
| Improvement focused on re-validation | Backward-looking doubt mindset | Shift to forward-looking improvement, enhance criteria for future work |
| Redundant cross-session verification | Verification efficiency not applied | Check verification count, trust documented state, apply efficiency protocols |

## Related Instructions

- **See also**: [feature_development.instructions.md](./feature_development.instructions.md) - SC/AC/CV gates creating trust foundation
- **Prerequisites**: [agentic_decision_making.instructions.md](../agentic_workflows/agentic_decision_making.instructions.md) - Context-first decision-making supporting trust-based execution
- **Next steps**: [development_workflow_essentials.instructions.md](./development_workflow_essentials.instructions.md) - Workflow patterns leveraging trust framework

---

**Success Criteria**: Agents trust completed phase outputs, implement per recommendations without re-analysis, validate current work not previous phases, and feed learnings into meta-system improvement.

**Confidence Check**: Are you reading previous phase outputs or re-analyzing them? Are you implementing per recommendations or redesigning? Are learnings captured for improvement or used to question past work?
