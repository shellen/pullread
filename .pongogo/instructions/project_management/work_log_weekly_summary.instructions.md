---
pongogo_instruction_spec: "0.0.2"
title: "Work Log Weekly Summary"
description: "Template and guidance for generating weekly work log summaries."
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
      - weekly_summary
      - work_log_weekly
      - weekly_work_log
      - week_summary
      - hierarchical_summarization
      - weekly_escalation
    nlp: "Generate weekly summaries from daily work log entries for cross-referencing and trend analysis"
evaluation:
  success_signals:
    - Weekly summary exists for all weeks with work
    - Critical items escalated (blockers, incidents, decisions)
    - Major work chunks summarized with status
    - Trends and themes identified across days
    - Summary fits 50-100 lines per week
  failure_signals:
    - Missing weekly summary for weeks with work
    - Over-compression losing important context
    - Missing cross-month week handling
    - No gap notation for empty weeks
    - Missing strategy notes (direction changes)
---


# Work Log Weekly Summary

**Purpose**: Generate weekly summaries from detailed daily work log entries, enabling manageable cross-referencing and trend analysis without requiring full work log parsing.

**Philosophy**: Hierarchical summarization preserves institutional knowledge while making it accessible. Weekly summaries bridge the gap between detailed daily entries (too granular for context windows) and monthly overviews (too compressed for specific queries).

---

## When to Apply

This instruction applies when:

- **Scenario 1**: First work log entry of a new week (Monday or first entry after Sunday)
- **Scenario 2**: Process requires work log cross-reference (e.g., issue triage, retrospectives)
- **Scenario 3**: Backfilling missing weekly summaries
- **Scenario 4**: End of month requiring final week summary

---

## Trigger Detection

**Automatic Trigger**: Use MCP time server to determine if summary generation is needed.

```python
# Check if new week has started
from datetime import datetime, timedelta

current_date = get_current_date_from_mcp()  # e.g., 2025-11-29 (Saturday)
week_start = current_date - timedelta(days=current_date.weekday())  # Monday

# If today is Monday and no summary exists for previous week, generate it
if current_date.weekday() == 0:  # Monday
    previous_week_end = current_date - timedelta(days=1)  # Sunday
    previous_week_start = previous_week_end - timedelta(days=6)  # Previous Monday
    # Check if summary exists for that week, if not, generate
```

**Manual Trigger**: When cross-referencing requires weekly summaries that don't exist.

---

## Quick Reference

**Weekly Summary File**: `{wiki_path}/Work-Log-YYYY-MM-Weekly.md`

**Week Definition**: Monday through Sunday (ISO week standard)

**Summary Structure**:
```markdown
## Week of November 25-December 1, 2025 (Week 48)

### Critical Items
- [Item that requires attention or follow-up]

### Major Work Completed
- **[Category]**: Brief description of work chunk
- **[Category]**: Brief description of work chunk

### Trends & Themes
- [Emerging pattern or recurring topic]

### Strategy Notes
- [Any strategic decisions, shifts, or clarifications]

### Key Issues Referenced
- #NNN: Brief status note
- #NNN: Brief status note
```

---

## Core Principles

- **Escalation-Based**: Only escalate items meeting criteria (critical, trends, strategy)
- **Week Boundaries**: Monday-Sunday per ISO standard
- **Compression Ratio**: Target 10:1 (10 daily entries → 1 weekly summary section)
- **Traceability**: Reference specific dates/entries for drill-down
- **No Loss**: If unsure whether to include, include with brief note

---

## Escalation Criteria

### 1. Critical Items (ALWAYS Escalate)

**Definition**: Items requiring attention beyond the current week

**Examples**:
- Blockers discovered that affect other work
- Incidents or failures with systemic implications
- Decisions that constrain future options
- Breakthroughs that enable new capabilities

**Format**:
```markdown
### Critical Items
- **BLOCKER**: Issue blocked by work log size - created task to resolve
- **INCIDENT**: Deployment failure - prevention measures implemented
- **DECISION**: Adopted hierarchical work log summaries (affects all future logging)
```

### 2. Major Work Chunks (Summarize)

**Definition**: Significant work completed during the week

**Aggregation Rules**:
- Group related entries by Epic/Task/Theme
- Note completion status (started, in progress, complete)
- Include key deliverables or artifacts created

**Format**:
```markdown
### Major Work Completed
- **Epic Retrospective**: Level 4 retrospective complete, 5 patterns extracted, epic ready for closure
- **Tooling**: /prune-open-issues tool development complete (v1.0 operational)
- **Issue Triage**: Clusters A & B complete (8 issues processed), methodology refined
```

### 3. Trends & Themes (Identify)

**Definition**: Patterns emerging across multiple days/entries

**Examples**:
- Recurring topics (e.g., "MCP server work dominated week")
- Process patterns (e.g., "methodology refinements in 3 separate sessions")
- Quality patterns (e.g., "5 retrospectives conducted this week")

**Format**:
```markdown
### Trends & Themes
- Heavy focus on routing operationalization (Epic closure prep)
- Multiple methodology refinements (issue triage, work logging, retrospectives)
- Documentation debt addressed (3 instruction files updated)
```

### 4. Strategy Notes (Preserve)

**Definition**: Higher-order context affecting project direction

**Examples**:
- Strategic decisions with rationale
- Scope changes or pivots
- Priority shifts
- Architectural clarifications

**Format**:
```markdown
### Strategy Notes
- **Milestone Optionality**: Established that not all issues need milestones
- **Icebox vs Backlog**: Clarified semantic distinction for issue triage
- **Work Log Hierarchy**: Decided to implement weekly/monthly summaries
```

---

## Step-by-Step: Generate Weekly Summary

### 1. Determine Week Boundaries

```bash
# Get current date from MCP time server
# Calculate week boundaries (Monday-Sunday)
# Example: Week of Nov 25 - Dec 1, 2025
```

### 2. Read Daily Entries for Week

- Open `{wiki_path}/Work-Log-YYYY-MM.md`
- Read ALL entries for dates within the week
- Note: Week may span two monthly files (e.g., Nov 25 - Dec 1)

### 3. Extract by Escalation Criteria

For each entry, ask:
- [ ] Is this critical? (blocker, incident, constraining decision, breakthrough)
- [ ] Is this major work? (significant deliverable, milestone progress)
- [ ] Does this contribute to a trend? (recurring topic, pattern)
- [ ] Is this strategy-relevant? (decision, pivot, priority change)

### 4. Aggregate and Compress

- Group related items
- Summarize multi-entry work into single bullets
- Preserve key details, drop routine information
- Target: ~50-100 lines per week

### 5. Add to Weekly Summary File

```markdown
# Work Log Weekly Summaries - November 2025

## Week of November 25-December 1, 2025 (Week 48)

### Critical Items
- ...

### Major Work Completed
- ...

### Trends & Themes
- ...

### Strategy Notes
- ...

### Key Issues Referenced
- ...

---

## Week of November 18-24, 2025 (Week 47)
...
```

### 6. Commit and Push

```bash
cd {wiki_path}
git add Work-Log-2025-11-Weekly.md
git commit -m "Add weekly summary: Week 48 (Nov 25 - Dec 1)"
git push
```

---

## File Structure

**Monthly Detail File** (existing): `{wiki_path}/Work-Log-YYYY-MM.md`
- Contains all daily entries
- Reverse chronological within each day
- No changes to existing structure

**Weekly Summary File** (new): `{wiki_path}/Work-Log-YYYY-MM-Weekly.md`
- One file per month containing all weeks
- Weeks in reverse chronological order (newest first)
- Links back to daily detail for drill-down

**Cross-Month Weeks**: When a week spans two months (e.g., Nov 25 - Dec 1):
- Summary appears in the file for the month containing Monday
- Example: Week of Nov 25 - Dec 1 → `Work-Log-2025-11-Weekly.md`

---

## Template

```markdown
# Work Log Weekly Summaries - [Month Year]

Navigation: [Monthly Summary](Work-Log-Summary) | [Daily Detail](Work-Log-YYYY-MM)

---

## Week of [Start Date]-[End Date], [Year] (Week NN)

### Critical Items
- [None this week / List critical items]

### Major Work Completed
- **[Category]**: Description
- **[Category]**: Description

### Trends & Themes
- [Pattern or recurring topic]

### Strategy Notes
- [Strategic decision or clarification]

### Key Issues Referenced
- #NNN: Status/outcome
- #NNN: Status/outcome

### Daily Entry Count
- Monday: N entries
- Tuesday: N entries
- ...
- Sunday: N entries
- **Total**: NN entries → summarized above

---

## Week of [Previous Week]
...
```

---

## Gap Handling

**No Work Done**: If a week has no entries:
```markdown
## Week of November 18-24, 2025 (Week 47)

*No work logged this week.*

---
```

**Partial Week**: If only some days have entries, summarize what exists and note gaps:
```markdown
### Daily Entry Count
- Monday: 0 entries
- Tuesday: 3 entries
- Wednesday-Sunday: 0 entries
- **Total**: 3 entries (partial week)
```

---

## Validation Checklist

- [ ] Week boundaries correct (Monday-Sunday)
- [ ] All daily entries for week reviewed
- [ ] Critical items identified and escalated
- [ ] Major work chunks summarized
- [ ] Trends identified across multiple days
- [ ] Strategy notes preserved
- [ ] Key issues referenced with status
- [ ] Summary fits in ~50-100 lines
- [ ] Links to daily detail work correctly
- [ ] File committed and pushed

---

## Common Pitfalls

### Pitfall 1: Missing Cross-Month Week
- **Problem**: Week spans Nov-Dec but only Nov entries reviewed
- **Solution**: Always check both monthly files for weeks at month boundaries

### Pitfall 2: Over-Compression
- **Problem**: Summary loses important context trying to be brief
- **Solution**: When uncertain, include more detail; monthly summary will compress further

### Pitfall 3: Missing Gap Notation
- **Problem**: Week with no entries has no entry in weekly file
- **Solution**: Always create week section, noting "No work logged" if empty

---

## Related Instructions

- **Parent**: [Work Logging](work_logging.instructions.md) - Daily entry creation
- **Sibling**: [Monthly Summary](work_log_monthly_summary.instructions.md) - Aggregate from weekly
- **Consumer**: Issue closure workflow - Uses weekly summaries for cross-reference

---

**Success Criteria**: Weekly summaries exist for all weeks with work, critical items escalated, major work visible, trends identified, and files under 200 lines enabling context-window-friendly cross-referencing.
