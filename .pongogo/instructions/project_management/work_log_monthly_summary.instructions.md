---
pongogo_instruction_spec: "0.0.2"
title: "Work Log Monthly Summary"
description: "Template and guidance for generating monthly work log summaries."
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
      - monthly_summary
      - work_log_monthly
      - monthly_work_log
      - month_summary
      - strategic_overview
      - project_health
    nlp: "Generate monthly summaries from weekly summaries for high-level project overview and strategic context"
evaluation:
  success_signals:
    - Monthly summary exists for all months with work
    - Highlights capture top 3-5 strategic achievements
    - Strategic shifts documented with rationale
    - Blockers and risks identified (forward-looking)
    - Summary fits 50-75 lines per month
  failure_signals:
    - Missing monthly summary for months with work
    - Listing everything instead of strategic significance
    - "No forward look (missing Blockers & Risks)"
    - Missing week at month boundaries
    - Summary too long (loses strategic focus)
---


# Work Log Monthly Summary

**Purpose**: Generate monthly summaries from weekly summaries, providing high-level project overview and strategic context for quarterly reviews, onboarding, and project health assessment.

**Philosophy**: Monthly summaries capture the strategic arc of work - what was the focus, what was achieved, what changed. They enable understanding project trajectory without parsing thousands of lines of detail.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: First work log entry of a new month (triggers previous month summary)
- **Scenario 2**: Quarterly review or project health assessment
- **Scenario 3**: Backfilling missing monthly summaries
- **Scenario 4**: Onboarding context for new agents/contributors

---

## Trigger Detection

**Automatic Trigger**: Use MCP time server to determine if summary generation is needed.

```python
# Check if new month has started
current_date = get_current_date_from_mcp()  # e.g., 2025-12-01

# If today is first of month and no summary exists for previous month, generate it
if current_date.day == 1:
    previous_month = current_date.month - 1 or 12
    previous_year = current_date.year if current_date.month > 1 else current_date.year - 1
    # Check if summary exists for that month, if not, generate
```

**Manual Trigger**: When strategic overview is needed and monthly summary doesn't exist.

---

## Quick Reference

**Monthly Summary File**: `{wiki_path}/Work-Log-Summary.md` (single file, all months)

**Summary Structure Per Month**:
```markdown
## November 2025

### Month at a Glance
- **Primary Focus**: [Main theme of the month]
- **Work Sessions**: NN sessions logged
- **Issues Progressed**: NN issues (NN closed, NN created)
- **Epics**: [Status of active Epics]

### Highlights
- [Major achievement 1]
- [Major achievement 2]
- [Major achievement 3]

### Strategic Shifts
- [Any changes to project direction, priorities, or approach]

### Patterns & Learnings
- [Key patterns extracted or validated]
- [Strategic insights gained]

### Blockers & Risks
- [Unresolved blockers carried forward]
- [Emerging risks identified]

### Key Metrics
- Tasks completed: NN
- Retrospectives conducted: NN
- Patterns added to library: NN
- Documentation pages updated: NN
```

---

## Core Principles

- **Strategic Focus**: Monthly summaries answer "What happened?" at a strategic level
- **Compression Ratio**: Target 4:1 (4 weekly summaries → 1 monthly section)
- **Trend Emphasis**: Surface patterns across weeks, not individual items
- **Decision Archaeology**: Preserve WHY things changed, not just WHAT changed
- **Actionable Forward**: Note what carries forward to next month

---

## Escalation Criteria (from Weekly to Monthly)

### 1. Highlights (Top 3-5 Achievements)

**Definition**: Most significant accomplishments of the month

**Selection Criteria**:
- Epic completions or major milestones
- Breakthrough moments or key decisions
- External-facing deliverables
- Foundational work enabling future progress

**Format**:
```markdown
### Highlights
- **Epic Complete**: Routing operationalization achieved with ground truth dataset
- **Tooling Milestone**: /prune-open-issues tool operational after methodology refinement
- **Hierarchical Work Logs**: Infrastructure created to address scalability
```

### 2. Strategic Shifts (Direction Changes)

**Definition**: Changes to project direction, priorities, or approach

**Examples**:
- Milestone restructuring
- Scope pivots
- Priority reordering
- Methodology changes

**Format**:
```markdown
### Strategic Shifts
- **Milestone Restructuring**: Legacy milestones closed, priority-based milestones created
- **Milestone Optionality**: Not all issues need milestones (methodology update)
- **Work Log Hierarchy**: Daily → Weekly → Monthly summarization implemented
```

### 3. Patterns & Learnings (Knowledge Gained)

**Definition**: Patterns, insights, and learnings institutionalized

**Examples**:
- Patterns added to Pattern Library
- Strategic Insights documented
- Process improvements validated
- Anti-patterns identified

**Format**:
```markdown
### Patterns & Learnings
- 5 patterns extracted from Epic retrospective
- "Umbrella Epic" anti-pattern identified and documented
- Issue triage methodology refined with knowledge-preservation focus
```

### 4. Blockers & Risks (Forward-Looking)

**Definition**: Issues requiring attention in upcoming month

**Examples**:
- Unresolved blockers
- Technical debt accumulating
- Resource constraints
- Emerging risks

**Format**:
```markdown
### Blockers & Risks
- **Work Log Size**: 38K+ lines per month unsustainable (addressed via task)
- **Issue Backlog**: 45 unmapped issues pending triage
- **Epic Closure**: Blocked on dependent task completion
```

---

## Step-by-Step: Generate Monthly Summary

### 1. Determine Month Boundaries

```bash
# Get current date from MCP time server
# If first of month, summarize previous month
# Example: December 1 → summarize November 2025
```

### 2. Read Weekly Summaries

- Open `{wiki_path}/Work-Log-YYYY-MM-Weekly.md`
- Read ALL weekly summaries for the month
- Note week count and total entry counts

### 3. Aggregate by Category

For each category, aggregate across all weeks:
- Highlights: Select top 3-5 most significant
- Strategic Shifts: Consolidate all direction changes
- Patterns & Learnings: List all new knowledge
- Blockers & Risks: Identify unresolved items

### 4. Calculate Metrics

From weekly summaries and issue tracking:
- Total sessions logged
- Issues progressed (closed, created)
- Retrospectives conducted
- Patterns added
- Documentation updates

### 5. Write Monthly Section

Add to `{wiki_path}/Work-Log-Summary.md`:
```markdown
## November 2025

### Month at a Glance
...

### Highlights
...

[etc.]

---
```

### 6. Commit and Push

```bash
cd {wiki_path}
git add Work-Log-Summary.md
git commit -m "Add monthly summary: November 2025"
git push
```

---

## File Structure

**Work-Log-Summary.md** (monthly summaries):
```markdown
# Work Log Summary

This document provides monthly summaries of project development work.

For weekly detail: See `Work-Log-YYYY-MM-Weekly.md`
For daily detail: See `Work-Log-YYYY-MM.md`

---

## November 2025
[Latest month first]

---

## October 2025
[Previous months follow]
```

---

## Template

```markdown
## [Month Year]

### Month at a Glance
- **Primary Focus**: [1-2 sentence description of month's main theme]
- **Work Sessions**: NN sessions logged across NN days
- **Issues Progressed**: NN issues (NN closed, NN created, NN in progress)
- **Epics Active**: [List active Epics with brief status]

### Highlights
1. [Most significant achievement]
2. [Second most significant]
3. [Third most significant]

### Strategic Shifts
- **[Topic]**: [What changed and why]
- **[Topic]**: [What changed and why]

### Patterns & Learnings
- [Pattern or insight gained]
- [Pattern or insight gained]

### Blockers & Risks
- **[Blocker]**: [Status and forward action]
- **[Risk]**: [What to watch for]

### Key Metrics
| Metric | Count |
|--------|-------|
| Tasks Completed | NN |
| Retrospectives | NN |
| Patterns Added | NN |
| Instruction Files Updated | NN |
| Wiki Pages Updated | NN |

### Weeks Summary
- Week 48 (Nov 25-Dec 1): [Brief theme]
- Week 47 (Nov 18-24): [Brief theme]
- Week 46 (Nov 11-17): [Brief theme]
- Week 45 (Nov 4-10): [Brief theme]
- Week 44 (Oct 28-Nov 3): [Brief theme - partial]

---
```

---

## Gap Handling

**No Work Done**: If a month has no entries:
```markdown
## November 2025

*No work logged this month.*

---
```

**Partial Month** (e.g., project started mid-month):
```markdown
### Month at a Glance
- **Primary Focus**: Project initialization
- **Work Sessions**: 5 sessions logged (Oct 27-31 only)
- **Note**: Project started October 27, 2025
```

---

## Validation Checklist

- [ ] All weekly summaries for month reviewed
- [ ] Top 3-5 highlights selected
- [ ] Strategic shifts documented with rationale
- [ ] Patterns and learnings aggregated
- [ ] Blockers and risks identified (forward-looking)
- [ ] Metrics calculated accurately
- [ ] Week themes summarized
- [ ] Summary fits in ~50-75 lines
- [ ] Navigation links work
- [ ] File committed and pushed

---

## Common Pitfalls

### Pitfall 1: Missing Weeks at Month Boundaries
- **Problem**: Week starting in Oct but mostly in Nov gets missed
- **Solution**: Check weekly file for cross-boundary weeks

### Pitfall 2: Listing Everything
- **Problem**: Monthly summary is just a list of everything done
- **Solution**: Focus on STRATEGIC significance, not completeness

### Pitfall 3: No Forward Look
- **Problem**: Summary only looks backward, misses blockers/risks
- **Solution**: Always include "Blockers & Risks" for continuity

---

## Related Instructions

- **Child**: [Weekly Summary](work_log_weekly_summary.instructions.md) - Source for monthly aggregation
- **Grandchild**: [Work Logging](work_logging.instructions.md) - Daily entry creation
- **Consumer**: Quarterly reviews, project health assessments, onboarding

---

**Success Criteria**: Monthly summaries exist for all months with work, highlights capture strategic achievements, shifts documented with rationale, patterns preserved, risks surfaced, and summary enables understanding project trajectory in under 75 lines per month.
