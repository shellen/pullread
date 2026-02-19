---
pongogo_instruction_spec: "0.0.2"
title: "Multi-Pass Iterative Analysis"
description: "Multi-pass iterative analysis methodology for complex tasks requiring progressive refinement."
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
      - multi-pass
      - iterative_analysis
      - cross-reference
      - N-to-N
      - gardening
      - triage
      - audit
      - prioritization
      - classification
      - reconciliation
      - staleness_assessment
      - overlap_detection
    nlp: "Structured methodology for analyzing collections with comprehensive cross-referencing"
evaluation:
  success_signals:
    - All items in scope enumerated (inventory pass)
    - N-to-N cross-referencing performed
    - Running notes file created before analysis starts
    - Evidence annotation for each classification decision
    - Actions executed immediately after category approval
  failure_signals:
    - Items missed in inventory
    - Cross-reference pass skipped
    - No tracking file (context loss unrecoverable)
    - Classification without evidence
    - Actions batched at end instead of immediate execution
---


# Multi-Pass Iterative Analysis Pattern

**Purpose**: Structured methodology for analyzing collections of items (issues, PIs, files, patterns) for classification, prioritization, or reconciliation using explicit N-to-N cross-referencing.

**Core Principle**: When analyzing a collection, partial context leads to missed relationships. The multi-pass approach with explicit cross-referencing ensures completeness.

**When to Apply**:
- PI system gardening
- Issue triage/pruning
- Milestone priority evaluation
- Pattern library extraction
- Documentation audit
- Any "review all X and decide Y" task

---

## Quick Reference

### The Seven Passes

| Pass | Name | Purpose | Output |
|------|------|---------|--------|
| 1 | **Inventory** | Enumerate all items in scope | Item list with metadata |
| 2 | **Clustering** | Group by source/theme/relationship | Cluster map |
| 3 | **Individual Assessment** | Evaluate each item against criteria | Per-item analysis |
| 4 | **Cross-Reference** | Compare each item vs ALL others | Relationship matrix |
| 5 | **Classification** | Assign category/priority/status | Classification decisions |
| 6 | **Reconciliation** | Resolve conflicts/overlaps | Action plan |
| 7 | **Action** | Execute decisions with tracking | Completed actions |

### Rigor Levels

| Level | Use Case | Passes Used | Cross-Reference Scope |
|-------|----------|-------------|----------------------|
| **Quick Scan** | Spot-check, minor changes | 1, 3, 5 | Obvious relationships only |
| **Standard** | Regular gardening, re-triage | 1-5, 7 | Within-cluster comparison |
| **Comprehensive** | First analysis, milestone boundaries | All 7 | N-to-N (ALL items) |

**Default Selection**:
- First analysis of a scope: **Comprehensive**
- Re-analysis after prior pass: **Standard**
- Quick hygiene check: **Quick Scan**

---

## Core Principles

### N-to-N Cross-Referencing

**The differentiator**: Every item compared against every other item at least once.

**Why this matters**:
- Partial comparison misses non-obvious relationships
- Items may overlap with "unrelated" clusters
- Hidden dependencies only visible through comprehensive review

**Implementation**:
```
For item A in collection:
  For item B in collection (B ≠ A):
    Assess: Does A relate to B? (overlap, dependency, conflict)
    Record: Relationship type and evidence
```

**Scaling**: For large collections (50+ items), batch by cluster then cross-reference across clusters.

### Cluster-First Analysis

**Before individual analysis, identify clusters**:

1. Scan all item titles/summaries
2. Group by source (same Epic, same domain, same type)
3. Label clusters with descriptive names
4. Process clusters together to identify within-cluster relationships

**Example Clusters**:
- Cluster A: "Learning Loop Documentation" (#1, #2, #3, #4)
- Cluster B: "Epic Documentation Gaps" (#5, #6, #7)
- Cluster C: "Research Spikes" (#8, #9, #10)

**Why cluster first**:
- Identifies obvious relationships early
- Reduces cognitive load during individual assessment
- Enables batch decisions for homogeneous clusters

### Running Notes (Context Preservation)

**MANDATORY**: Create tracking file before starting.

**Required Contents**:
1. **Status tracker**: Phase/pass progress, counts, completion status
2. **Item-by-item table**: ID, cluster, analysis completed, classification
3. **Evidence annotations**: Rationale for each decision
4. **Cross-reference notes**: Relationships discovered

**Purpose**: Enable recovery after context loss (auto-compact, session break).

**Template**:
```markdown
# Analysis Tracking: [SCOPE] - [DATE]

## Progress
- Pass 1 (Inventory): ✅ Complete (N items)
- Pass 2 (Clustering): ✅ Complete (X clusters)
- Pass 3 (Individual): 🔄 In Progress (Y/N complete)
- Pass 4 (Cross-Reference): ⏳ Pending
...

## Item Analysis Table
| ID | Cluster | Pass 3 | Pass 4 | Classification | Evidence |
|----|---------|--------|--------|----------------|----------|
| #1 | A | ✅ | ✅ | VALID | No overlaps found |
| #2 | A | ✅ | 🔄 | - | Checking vs #5 |
...

## Relationships Discovered
- #1 and #5: Partial overlap (~30%), reconciliation needed
- #3 blocks #7: Dependency discovered
...
```

---

## Pass Descriptions

### Pass 1: Inventory

**Goal**: Complete enumeration of all items in scope with metadata.

**Actions**:
1. Query/list all items in scope
2. Capture: ID, title, created date, last modified, current status
3. Verify count matches expectations
4. Record in tracking file

**Output**: Item list with metadata

**Verification**: "I expect N items. I have retrieved N items."

### Pass 2: Clustering

**Goal**: Group items by source/theme before individual analysis.

**Actions**:
1. Scan all titles for patterns
2. Identify grouping criteria (source Epic, domain, type, date range)
3. Assign each item to exactly one cluster
4. Label clusters descriptively
5. Record cluster map in tracking file

**Output**: Cluster map (Cluster → Items)

**Cluster Naming**: Use descriptive names, not just letters.
- Good: "Learning Loop Documentation Layer Gap"
- Bad: "Cluster A"

### Pass 3: Individual Assessment

**Goal**: Evaluate each item against defined criteria.

**Actions**:
1. Read full item content (body, comments, history)
2. Apply assessment criteria (depends on analysis type)
3. Note initial classification hypothesis
4. Flag items needing cross-reference attention
5. Record analysis in tracking file

**Output**: Per-item analysis notes

**Assessment Criteria Examples**:
- Triage: Staleness indicators, blocker status, scope clarity
- Prioritization: Dependency unlocking, quality improvement, time to value
- PI Gardening: Corrective vs exploratory, confidence level, staleness

### Pass 4: Cross-Reference

**Goal**: Compare each item against all others to find relationships.

**Actions**:
1. For each item, compare against all others in scope
2. Identify: Overlaps, dependencies, conflicts, supersession
3. Record relationship type and evidence
4. Flag items needing reconciliation
5. Update tracking file with relationships

**Output**: Relationship discoveries

**Relationship Types**:
- **Overlap**: Partial scope intersection (requires reconciliation)
- **Dependency**: A blocks B or A enables B
- **Supersession**: Newer item replaces older item's scope
- **Conflict**: Mutually exclusive approaches
- **None**: Independent items

**Comprehensive vs Standard**:
- Comprehensive: Compare ALL items vs ALL items
- Standard: Compare within clusters + spot-check across clusters

### Pass 5: Classification

**Goal**: Assign final category/priority/status to each item.

**Actions**:
1. Review Pass 3 (individual) and Pass 4 (cross-reference) findings
2. Apply classification criteria
3. Assign category with evidence
4. Update tracking file

**Output**: Classification decisions with evidence

**Evidence Annotation Format**:
```
VALID - [STATUS] (N-pass verified YYYY-MM-DD: [evidence summary])
```

### Pass 6: Reconciliation

**Goal**: Create action plan for conflicts, overlaps, dependencies.

**Actions**:
1. For each flagged relationship, determine resolution
2. Apply resolution principles (recency bias, scope clarity, etc.)
3. Create reconciliation plan
4. Document in tracking file

**Output**: Reconciliation action plan

**Resolution Principles**:
- **Recency Bias**: Favor newer items when scope overlaps
- **Consolidation**: Merge unique details into primary item
- **Dependency Ordering**: Ensure blockers resolved before dependents

### Pass 7: Action

**Goal**: Execute decisions with tracking and verification.

**Actions**:
1. Present findings for approval (interactive)
2. Execute approved actions immediately (not batched)
3. Record actions taken
4. Verify completion

**Output**: Completed actions with evidence

**Interactive Workflow**:
1. Present summary (counts by category)
2. Walk through each category
3. Get approval via AskUserQuestion
4. Execute immediately
5. Confirm completion
6. Move to next category

---

## Application Examples

### PI System Gardening

**Inventory**: List all PI files with metadata (created, modified, confidence)
**Clustering**: Group by domain, confidence level, or source task
**Assessment Criteria**: Corrective vs exploratory, staleness, duplicate detection
**Classification**: KEEP, ARCHIVE, MERGE, MIGRATE_TO_RH
**Action**: Update PI index, archive stale items, merge duplicates

### Issue Triage

**Inventory**: Query project board for target column
**Clustering**: Group by Epic, domain, type
**Assessment Criteria**: Staleness indicators, blocker status, scope clarity
**Classification**: VALID, STALE, SUPERSEDED, DUPLICATE, PREMATURE
**Action**: Close, move, or keep with updated status

### Milestone Priority Evaluation

**Inventory**: List all issues in milestone
**Clustering**: Group by dependency chain, domain
**Assessment Criteria**: Dependency unlocking, quality improvement, time to value
**Classification**: Priority order with rationale
**Action**: Update milestone body, create blocking relationships

---

## Anti-Patterns

### Skip Cross-Reference Pass

**Problem**: "I'll just assess each item individually"
**Risk**: Missed relationships, duplicate work, incorrect classifications
**Fix**: Always include Pass 4, adjust rigor level for scope

### No Running Notes

**Problem**: "I'll remember where I was"
**Risk**: Context loss makes recovery impossible
**Fix**: Create tracking file BEFORE starting, update in real-time

### Batch Actions at End

**Problem**: "I'll execute all actions after analysis complete"
**Risk**: Decision fatigue, context drift, missed approvals
**Fix**: Execute actions immediately after each category approval

### Skip Clustering

**Problem**: "I'll just process items in order"
**Risk**: Miss within-cluster relationships, inefficient processing
**Fix**: Always cluster first, even if clusters seem obvious

---

## Integration with Other Patterns

### Retrospective Depth Selection

Multi-pass analysis can trigger retrospectives:
- Analysis reveals systemic issues → L3 retrospective
- Pattern emerges across items → L2 pattern extraction
- Routine gardening → L1 work log entry

### Issue Commencement/Closure

Multi-pass analysis tasks follow standard commencement/closure:
- Commence: Status transitions, project status update
- Closure: Checklist, learning loop, cross-issue updates

### PI System

Multi-pass analysis may create PI entries:
- Recurring pattern discovered → Track in PI
- Process gap identified → Create PI

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Missing relationships | Skipped cross-reference pass | Run Pass 4 comprehensively |
| Context loss during analysis | No tracking file | Create tracking file, resume from last recorded position |
| Inconsistent classifications | No evidence annotation | Re-run with explicit evidence recording |
| Scope creep during analysis | No inventory verification | Verify item count matches expectations |
| Decision paralysis | Too many items at once | Batch by cluster, process one cluster at a time |

---

## Related Instructions

- **Milestone Governance**: `milestone_governance.instructions.md`
- **PI System**: `potential_improvements.md`

---

**Success Criteria**: Analysis produces complete, consistent classifications with evidence trail that survives context loss and enables audit.

**Confidence Check**:
1. Did I enumerate ALL items in scope?
2. Did I compare each item against ALL others (appropriate to rigor level)?
3. Can I point to evidence for each classification?
4. Can someone resume from my tracking file after context loss?
