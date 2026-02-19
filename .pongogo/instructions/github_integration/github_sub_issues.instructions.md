---
pongogo_instruction_spec: "0.0.2"
title: "GitHub Sub-Issues Usage Standards"
description: "GitHub sub-issues usage standards, hierarchy patterns, and relationship management."
applies_to:
  - "**/*"
domains:
  - "github"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - sub-issue
      - sub_issue
      - subissue
      - child_issue
      - parent_issue
      - 10+_items
      - progress_tracking
      - trackedIssues
      - subIssuesSummary
      - automatic_progress
      - execution_tracking
      - embedded_context
    nlp: "When and how to use GitHub sub-issues for multi-step execution tracking with automatic progress calculation"
evaluation:
  success_signals:
    - Sub-issues used only for 10+ execution items
    - Items can execute independently (parallel)
    - Analysis embedded in sub-issue descriptions
    - Automatic progress tracking via GitHub
    - Checklists and sub-issues used complementarily
  failure_signals:
    - Sub-issues for fewer than 10 items (use checkboxes)
    - Sub-issues for sequential stages (use checklist)
    - Over-granular decomposition (5-minute tasks)
    - Missing embedded context (4+ external sources needed)
    - Using sub-issues when checkboxes sufficient
---


# GitHub Sub-Issues Usage Standards

**Purpose**: Define when and how to use GitHub sub-issues for multi-step execution tracking with automatic progress calculation and programmatic navigation.

**Philosophy**: Use sub-issues when programmatic progress queries, automatic percentage calculation, and zero-maintenance synchronization provide clear value over manual tracking.

---

## When to Apply

Use sub-issues when:

- Epic task involves 10+ discrete execution items requiring systematic tracking
- Items can execute independently (parallel-executable, order-flexible)
- Programmatic progress queries provide value for agent decision-making
- Multiple context sources currently required (reducing to 1-2 sources)
- Long-running implementation spans multiple sessions/weeks

Do NOT use sub-issues when:

- Fewer than 10 execution items (use markdown checkboxes instead)
- Items are tightly coupled sequential steps (use checklist in Issue description)
- Items don't map to trackable GitHub issues
- Over-granular decomposition (5-minute tasks)

---

## Quick Reference

**Sub-Issues Decision Criteria**:

**1. Use Sub-Issues When** (All must be true):
- [ ] **10+ discrete execution items** (threshold justified)
- [ ] **Items executable independently** (parallel or order-flexible)
- [ ] **Programmatic progress queries valuable** (agents need automatic tracking)
- [ ] **Context currently spread across 4+ sources** (reducing to 1-2)
- [ ] **Long-running work** (multiple sessions/weeks)

**2. Do NOT Use Sub-Issues When** (Any is true):
- [ ] **< 10 execution items** → Use markdown checkboxes instead
- [ ] **Tightly coupled sequential steps** → Use checklist in Issue description
- [ ] **Items don't map to GitHub issues** → Not suitable for issue tracking
- [ ] **Over-granular tasks** (5-minute edits) → Combine into meaningful units

**3. Sub-Issues vs Checklists** (Complementary, Not Competing):
```
Checklists (within Issue):
├─ INTERNAL TRACKING
├─ Sequential or simple steps
├─ Manual checkbox updates
└─ Within single Issue scope

Sub-Issues:
├─ EXTERNAL EXECUTION
├─ Parallel items (can execute independently)
├─ Automatic progress tracking
└─ Across multiple execution units (GitHub Issues)
```

**4. Sub-Issue Creation Pattern**:
```bash
# Step 1: Create parent issue
gh issue create \
  --title "[Epic Task Title] - Sub-Issues Tracking" \
  --label "task,tracking" \
  --body "Overview and execution approach"

# Step 2: Create sub-issues with embedded context
for i in {1..15}; do
  gh issue create \
    --title "Sub-Issue: [Action] [Target]" \
    --label "sub-issue" \
    --body "Embedded analysis and acceptance criteria" \
    --assignee @me

  # Link to parent (GitHub UI or GraphQL)
done
```

**5. Progress Query Pattern (GraphQL)**:
```graphql
query GetSubIssuesProgress($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      title
      trackedIssues(first: 100) {
        totalCount
        nodes {
          number
          title
          state
          closed
        }
      }
    }
  }
}

# Automatic calculation:
# Progress = (closedCount / totalCount) * 100%
```

**6. Sub-Issue Naming Convention**:
```markdown
# Simple and direct
Sub-Issue: Add Quick Reference to observability_patterns.instructions.md
Sub-Issue: Update validation framework with new standards
Sub-Issue: Implement rate limiting middleware
Sub-Issue: Document API endpoints in OpenAPI spec
```

**7. When to Use Markdown Checkboxes Instead**:
```markdown
# < 10 items, sequential, within single task
## Implementation Checklist

### Acceptance Criteria
- [ ] Authentication middleware implemented
- [ ] Token validation logic added
- [ ] Error handling for invalid tokens
- [ ] Integration tests added

# 4 items = Use checkboxes, NOT sub-issues
```

---

## Core Principles

- **Checklists vs Sub-Issues are Complementary**: Checklists track INTERNAL steps (sequential items within Issue), sub-issues track EXTERNAL execution (parallel work across GitHub Issues)
- **10+ Item Threshold**: Sub-issues justified only when tracking 10+ discrete execution units
- **Automatic Progress**: GitHub calculates completion percentage, no manual tracking needed
- **Programmatic Navigation**: Single GraphQL query retrieves complete hierarchy (child → parent → Epic)
- **Context Reduction**: Embed analysis in sub-issue descriptions (4+ sources → 1-2 sources)

## Step-by-Step Guidance

### 1. **Verify Sub-Issues Suitability**
   - Confirm 10+ execution items exist
   - Verify items represent meaningful work (not trivial edits)
   - Check items can execute independently
   - Validate programmatic progress tracking provides value
   - Ensure items map to GitHub issues
   - Expected outcome: Sub-issues approach justified with clear criteria

### 2. **Plan Sub-Issue Organization**
   - One sub-issue per discrete execution item
   - Embed relevant analysis/recommendations in sub-issue description
   - Define clear acceptance criteria for each sub-issue
   - Document dependencies if execution order requirements exist
   - Expected outcome: Sub-issue structure planned systematically

### 3. **Create Parent Issue Structure**
   - Title: `[Epic Task Title] - Sub-Issues Tracking`
   - Add overview describing overall objective
   - Document execution approach (how sub-issues will be processed)
   - Include progress tracking section (GitHub auto-calculates)
   - Add success criteria for overall completion
   - Expected outcome: Parent issue ready to coordinate sub-issues

### 4. **Create Sub-Issues with Embedded Context**
   - Use GitHub UI or API to create sub-issues linked to parent
   - Embed analysis recommendations directly in sub-issue descriptions
   - Include links to source issues/files being modified
   - Add acceptance criteria specific to that sub-issue
   - Simple naming: `Sub-Issue: [Action] [Target] ([Optional Context])`
   - Expected outcome: Sub-issues created with complete execution context

### 5. **Validate Structure**
   - Verify parent issue shows automatic progress: "X/Y completed (Z%)"
   - Confirm sub-issues render with checkboxes in parent issue body
   - Test GraphQL queries for programmatic progress access
   - Validate agents can discover and execute sub-issues systematically
   - Expected outcome: Sub-issue tracking operational and accessible

### 6. **Execute Sub-Issue Workflow**
   - Query open sub-issues using GraphQL API
   - Read sub-issue description for embedded analysis/context
   - Execute work per recommendations
   - Close sub-issue upon completion with evidence comment
   - Parent progress automatically updates
   - Expected outcome: Systematic execution with automatic tracking

## Examples

### Example 1: Checklists AND Sub-Issues Together (Common Pattern)

Scenario: Project needs to update 25 existing task issues with improved templates

```markdown
# [Task]-comprehensive_task_updates

**Part of**: [Epic]-template_improvements (Issue #55)

## Coordination Checklist (Internal tracking):

### Setup & Planning
- [ ] Analyze existing task issues for update patterns
- [ ] Design sub-issue template with embedded recommendations
- [ ] Foundation ready for execution

### Execution Tracking
- [ ] All 25 sub-issues created
- [ ] Sub-issues being executed (GitHub shows: 12/25 completed)
- [ ] Execution proceeding systematically

### Completion Validation
- [ ] All sub-issues closed (GitHub shows: 25/25 completed)
- [ ] Quality validated across all updated tasks
- [ ] Task operationally complete

## Sub-Issues (External Execution - Parallel):
[GitHub renders automatically with progress: 12/25 completed (48%)]

- Sub-Issue: Update Task (Authentication Service)
- Sub-Issue: Update Task (Routing Service)
- Sub-Issue: Update Task (Audit Service)
- ... (22 more)
```

**Context**: Parent task has checklist for coordination while sub-issues track discrete update targets
**Expected Result**: Execution checklist completion depends on sub-issue progress, measured automatically by GitHub

### Example 2: API Navigation Pattern (Child → Parent → Epic)

Scenario: Agent executing Sub-Issue #47, needs parent Epic context

```bash
# Single GraphQL query retrieves complete hierarchy
gh api graphql \
  -f owner="{owner}" \
  -f repo="{repo}" \
  -F issueNumber=47 \
  -f query='
    query GetHierarchy($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          number
          title
          body
          # Navigate UP to parent
          parent {
            number
            title  # Contains Epic info
            # Navigate DOWN to siblings
            subIssues(first: 100) {
              totalCount
              nodes {
                number
                title
                state
              }
            }
            subIssuesSummary {
              total
              completed
              percentCompleted
            }
          }
        }
      }
    }'

# Result shows:
# - Sub-Issue #47 details
# - Parent: Issue #38 "[Task]-registry_implementation" (Part of: [Epic]-knowledge_routing)
# - Epic: [Epic]-knowledge_routing
# - Siblings: 18 other sub-issues
# - Progress: 7/19 completed (37%)
```

**Context**: Single API call provides complete context for agent decision-making
**Expected Result**: Agent understands Epic context, parent task, sibling progress without multiple queries

### Example 3: Sub-Issue with Embedded Analysis

Scenario: Creating sub-issue that embeds analysis to reduce context sources

```markdown
# Sub-Issue: Retrofit Authentication Task

**Parent**: [Task]-comprehensive_retrofit (Part of: [Epic]-task_structure)

## Source Task
[Task: Authentication Service Implementation](https://github.com/{owner}/{repo}/issues/XX)

## Analysis Summary
**Update Category**: HIGH - Complex task requiring comprehensive checklist structure

**Recommended Structure**:
- Apply phased checklist approach (Setup → Implementation → Validation)
- Success Criteria: 6 items across 3 sections
- Acceptance Criteria: 4 items validating deliverables
- Completion Validation: 2 items ensuring operational readiness

**Content Preservation Requirements**:
- Maintain Epic relationship: [Epic]-task_structure
- Preserve authentication technical context
- Keep JWT implementation details
- Retain OAuth integration specifications

## Execution Steps
1. Read task issue current body
2. Trust embedded recommendations without re-analysis
3. Implement retrofit per structure above
4. Validate transformation meets acceptance criteria
5. Close this sub-issue with commit reference

## Acceptance Criteria
- [ ] Task body updated with phased checklist structure
- [ ] All technical context preserved
- [ ] Epic relationship documented
- [ ] Transformation validated via GitHub API

## Related
- Parent: [Task]-comprehensive_retrofit (Issue #55)
- Epic: [Epic]-task_structure
- Category: Service Implementation Tasks
```

**Context**: Sub-issue contains all context needed - agent reads once, executes directly
**Trade-offs**: Longer sub-issue description, but eliminates need for external analysis files

## Validation Checklist

Before creating sub-issues structure:

### Justification Validation
- [ ] Item count ≥ 10 discrete execution units
- [ ] Items represent meaningful work (not trivial edits)
- [ ] Items can execute independently (order-flexible)
- [ ] Programmatic progress tracking provides value
- [ ] Items map to GitHub issues (not abstract concepts)

### Anti-Pattern Avoidance
- [ ] NOT using sub-issues for sequential phases
- [ ] NOT creating sub-issues for individual file edits
- [ ] NOT decomposing into trivial 5-minute tasks
- [ ] NOT using sub-issues when checkboxes sufficient

### Implementation Readiness
- [ ] Parent issue description explains execution approach
- [ ] Sub-issue template designed with embedded analysis
- [ ] GraphQL queries prepared for programmatic access
- [ ] Agent execution workflow documented

## Common Pitfalls

### Pitfall 1: Using Sub-Issues for Sequential Stages

- **Problem**: Creating sub-issues for "Design", "Implementation", "Testing" stages
- **Why it happens**: Confusion between sequential stages and parallel items
- **Solution**: Use checklist in Issue description for sequential stages
- **Example**: Feature development has Design → Implement → Validate checklist sections, not 3 sub-issues

### Pitfall 2: Creating Sub-Issues Below 10-Item Threshold

- **Problem**: Using sub-issues for 5 execution items
- **Why it happens**: Overengineering simple tracking needs
- **Solution**: Use markdown checkboxes for <10 items
- **Example**: Task with 7 acceptance criteria uses checkboxes, not sub-issues

### Pitfall 3: Over-Granular Decomposition

- **Problem**: Sub-issue for every individual file edit (30 sub-issues for 30 files)
- **Why it happens**: Misunderstanding "discrete execution unit" concept
- **Solution**: Group related files into meaningful execution units
- **Example**: "Update authentication middleware" (5 files) as one sub-issue, not 5 separate sub-issues

### Pitfall 4: Missing Embedded Analysis

- **Problem**: Sub-issues require agent to consult 4 external sources
- **Why it happens**: Failing to embed recommendations in sub-issue descriptions
- **Solution**: Copy key analysis into sub-issue description
- **Example**: Include retrofit recommendations directly in sub-issue, not just link to external doc

## Edge Cases

### Edge Case 1: Sub-Issue Has Own Phases

**When**: Individual sub-issue represents complex work needing phased execution
**Approach**:
- Sub-issue can have its own checklist sections internally
- Parent checklist tracks overall task progression
- Sub-issue checklist tracks individual item execution
- Both use markdown checkboxes for tracking
**Example**: Sub-issue "Update Authentication Task" has Analysis → Implementation → Validation checklist sections

### Edge Case 2: Parent Progress Blocked by Sub-Issue Dependency

**When**: Some sub-issues must complete before others can start
**Approach**:
- Document dependencies explicitly in sub-issue descriptions
- Use "blocked" label on dependent sub-issues
- Agent queries for unblocked sub-issues only
- Parent phase gates track dependency milestones
**Example**: Sub-issues 1-5 (foundation) must complete before sub-issues 6-20 (implementation) can start

### Edge Case 3: Sub-Issue Reveals Additional Work

**When**: Executing sub-issue uncovers need for more sub-issues
**Approach**:
- Create additional sub-issues as discovered
- Update parent issue's execution tracking count
- Document scope discovery in work log
- Adjust completion expectations transparently
**Example**: Updating 25 tasks reveals 3 more needing updates → add 3 sub-issues (25 → 28 total)

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| `parent` field returns `null` | Issue not linked as sub-issue | Use `addSubIssue` GraphQL mutation to establish relationship |
| `subIssues` returns empty | No sub-issues created yet | Verify sub-issues exist and are properly linked |
| Epic parsing fails | Parent title doesn't match current format | Ensure parent follows "[Task]-name" format with "Part of: [Epic]-name" when applicable |
| Progress not auto-updating | Sub-issue state not changing | Close sub-issues properly, don't just mark complete |
| Sub-issue context insufficient | Analysis not embedded | Add key recommendations directly to sub-issue description |

## Related Instructions

- **Prerequisites**: [task_creation_workflow.instructions.md](../project_management/task_creation_workflow.instructions.md) - Follow before creating parent issue
- **See also**: [trust_based_task_execution.instructions.md](../trust_execution/trust_based_task_execution.instructions.md) - Phases complement sub-issues, not replace them
- **Integration**: [github_essentials.instructions.md](./github_essentials.instructions.md) - Machine-readable tracking applies to both checkboxes and sub-issues
- **See also**: [glossary_maintenance.instructions.md](../project_management/glossary_maintenance.instructions.md) - Keeping glossary current and complete

---

**Success Criteria**: Sub-issues used only when 10+ items justify overhead, with automatic progress tracking, embedded context reducing sources to 1-2, and bidirectional API navigation enabling systematic agent execution.

**Confidence Check**: Do you have 10+ discrete execution items? Can items execute independently? Will programmatic progress queries add value? Is analysis embedded in sub-issue descriptions?
