---
pongogo_instruction_spec: "0.0.2"
title: "Work Logging"
description: "Work logging standards and entry format for project management context."
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
      - work_log
      - work_logging
      - add_work_log_entry
      - work_log_entry
      - progress_tracking
      - institutional_knowledge
      - two-level_learning
    nlp: "Work logging, progress tracking, and institutional knowledge capture through wiki integration"
evaluation:
  success_signals:
    - Wiki repository validated before adding entry
    - Entry at TOP of date section (reverse chronological)
    - "Bidirectional links created (wiki <-> GitHub)"
    - Two-level learning captured (content + process)
    - Changes committed and pushed immediately
  failure_signals:
    - Skipping wiki validation before entry
    - Entry appended to bottom (chronological order)
    - "One-way linking (wiki -> GitHub only)"
    - Missing sidebar update on first entry of day
    - Forgetting to push after commit
---


# Work Logging

**Purpose**: Establish systematic work logging capturing development progress, strategic decisions, and institutional knowledge through wiki integration for agent and human reference.

**Philosophy**: Work logs are living memory - comprehensive, timely entries enable agents to understand project context and make informed decisions without manual lookup. Work logs capture both what we learned (content) and how we learned it (process meta-knowledge).

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Completing significant development work (Epic tasks, milestones, architectural decisions)
- **Scenario 2**: Documenting strategic decisions or technical investigations
- **Scenario 3**: Recording milestone progress or Epic completion validation
- **Scenario 4**: Capturing lessons learned or systematic improvements
- **Scenario 5**: Creating institutional knowledge reference for future work

---

## Work Log Entry Timing

**Single Entry Per Task/Issue Pattern** (PREFERRED):
- Create work log entry **during learning loop execution** (at task completion)
- Entry captures: Implementation summary, decisions, learnings, evidence, commits
- Status note: "Awaiting approval" at time of entry
- **No separate closure entry needed** - closure is administrative

**When Closure Entry IS Valuable** (EXCEPTION):
- Significant delay between completion and closure (days/weeks)
- New learnings discovered during review process
- Significant changes made based on user feedback
- In these cases: Update original entry OR create addendum

**Anti-Pattern to Avoid**:
- Completion entry + Closure entry = Redundant information
- Two entries documenting same deliverables/commits/evidence
- Single comprehensive entry at completion captures all necessary context

---

## Quick Reference

**Most Common Patterns**:

**1. Basic Work Log Entry Format**:
```markdown
### 04:15 PM [milestone]
#### Epic Validation Complete
Description of work completed...
```

**2. Entry with Two-Level Learning**:
```markdown
### 02:45 PM [development]
#### Feature Implementation Complete
Main description of work...

**LEARNING (Level 1 - Content)**:
- Technical knowledge gained
- Patterns discovered

**LEARNING (Level 2 - Process)**:
- Decision-making insights
- Collaboration patterns observed
```

**3. Bidirectional Linking**:
```markdown
See [GitHub Issue #45](https://github.com/{org}/{repo}/issues/45)

# In GitHub Issue #45:
Work Log: [Oct 27 Entry](https://github.com/{org}/{repo}/wiki/Work-Log-2025-10#october-27-2025)
```

**4. Check if First Entry of Day** (Bash):
```bash
DATE_LINK="[[Oct 27|Work-Log-2025-10#october-27-2025]]"
if ! grep -q "$DATE_LINK" _Sidebar.md; then
  echo "Update sidebar with today's date"
fi
```

**5. Commit and Push Workflow**:
```bash
cd {wiki_path}
git add .
git commit -m "Add work log entry: [description]"
git push origin master
```

---

## Core Principles

- **Wiki-Based System**: Wiki is single source of truth for strategic development tracking
- **Hierarchical Summarization**: Daily -> Weekly -> Monthly summaries enable both detail and overview
- **Monthly Work Log Files**: Entries organized in monthly files (Work-Log-YYYY-MM.md) with structured format
- **Reverse Chronological Order**: Newest entries at top within date sections for easy discovery
- **Bidirectional Linking**: Link from wiki to GitHub artifacts AND mirror links back from GitHub to wiki
- **Immediate Commit and Push**: All wiki changes committed and pushed immediately
- **Two-Level Learning Capture**: Every work log entry captures both content learning (what we learned) and process learning (how we learned it)

---

## Hierarchical Work Log System

Work logs use a 3-tier hierarchy to balance detail with accessibility:

| Level | File | Content | Use Case |
|-------|------|---------|----------|
| **Daily** | `Work-Log-YYYY-MM.md` | Full detail entries | Real-time capture, session reference |
| **Weekly** | `Work-Log-YYYY-MM-Weekly.md` | Escalated summaries | Cross-referencing, trend analysis |
| **Monthly** | `Work-Log-Summary.md` | Strategic overview | Project health, onboarding, reviews |

### Why Hierarchical?

**Problem**: Monthly work logs can exceed 30,000+ lines, making them:
- Impossible to fit in agent context windows
- Impractical for cross-referencing during processes like issue triage
- Difficult to identify patterns and trends

**Solution**: Generate weekly and monthly summaries with escalation criteria:

1. **Critical Items**: Blockers, incidents, constraining decisions, breakthroughs
2. **Major Work Chunks**: Significant deliverables grouped by Epic/Task/Theme
3. **Trends & Themes**: Patterns emerging across multiple days/entries
4. **Strategy Notes**: Direction changes, priorities, approach shifts

### Compression Ratios

- **Weekly**: ~10:1 (10 daily entries -> 1 summary section, ~50-100 lines)
- **Monthly**: ~4:1 (4 weekly summaries -> 1 monthly section, ~50-75 lines)

---

## Two-Level Learning Capture

Work logs must capture **two distinct types of learning** at every moment of analysis:

### Level 1: Content Learning (What We Learned)
**Definition**: Knowledge gained from the work product itself

**Examples**:
- "Cognitive load is reduced by 78% when agents load focused files vs comprehensive files"
- "Batch processing in migrations avoids table locks"
- "Security patterns consolidated from 3 files into 1 focused file"

**Captured in**: Main entry description, technical details, outcomes

### Level 2: Process Learning (How We Learned)
**Definition**: Meta-knowledge about the process, collaboration, and decision-making

**Examples**:
- "User's correction about evaluation criteria led to better analysis"
- "Effective feedback pattern: state real criteria explicitly, explain rationale"
- "After decision pivots, user requests execution confirmation"
- "Solo founder context means long-term quality trumps short-term speed"

**Captured in**: "LEARNING:" tagged sections, process insights, collaboration patterns

### Why Both Levels Matter

**Content learning alone** builds knowledge base and improves technical quality but doesn't improve how we work together or evolve collaboration patterns.

**Process learning added** enables continuous improvement of:
- Collaboration patterns and effective communication
- Decision-making frameworks
- Human-agent interaction quality
- System-level evolution

### How to Capture in Work Logs

**Format for entries with significant learnings**:
```markdown
### HH:MM AM/PM [tag]
#### Entry Title
Main description of work completed, decisions made, outcomes achieved.

**LEARNING (Level 1 - Content)**:
- Technical knowledge gained
- Patterns discovered
- Measurable outcomes

**LEARNING (Level 2 - Process)**:
- Decision-making insights
- Collaboration patterns observed
- Effective feedback moments
- Workflow evolution
- Meta-knowledge about how we worked
```

**When to include learning capture**:
- Significant decisions or pivots
- User corrective feedback received
- New collaboration patterns discovered
- Workflow improvements identified
- Gap recognition in process
- NOT for routine technical updates (unless process insights)

## Step-by-Step Guidance

1. **Validate Wiki Repository (Mandatory First Step)**
   - Check if wiki repository exists at `{wiki_path}/`
   - Update to latest version with `git pull origin master`
   - Verify work log files accessible (Work-Log-YYYY-MM.md for current month)
   - Expected outcome: Wiki repository validated and current before adding entry

2. **Get Validated Timestamp**
   - Use time service or system time with timezone awareness
   - Validate timezone offset matches project timezone
   - Format: HH:MM AM/PM (12-hour format for readability)
   - Success indicator: Timestamp accurate and timezone-consistent

3. **Create Work Log Entry**
   - Navigate to current month's work log (e.g., Work-Log-2025-10.md)
   - Find or create date section (e.g., `## October 27, 2025`)
   - Insert entry at TOP of date section (reverse chronological order)
   - Follow format: `### HH:MM AM/PM [tag]` then `#### Title` then description
   - Common variation: Entry titles should be 3-6 words for scannability

4. **Update Sidebar (First Entry of Day Only)**
   - Check if current date already exists in `_Sidebar.md`
   - If missing (first entry of day), add date link at top of sidebar section
   - Maintain maximum 4-5 recent dates; remove oldest if needed
   - Success indicator: Sidebar provides quick navigation to recent work

5. **Apply Bidirectional Linking**
   - Link from wiki entry to GitHub issues, PRs, commits
   - Add wiki URL to referenced GitHub artifact (issue body or comment)
   - Use full URLs for GitHub artifacts (not relative references)
   - Expected outcome: Agents can traverse context in both directions

6. **Commit and Push Immediately**
   - Stage changes: `git add .`
   - Commit with descriptive message: `git commit -m "Add work log entry: [brief description]"`
   - Push to remote: `git push origin master`
   - Success indicator: Changes visible in GitHub wiki interface immediately

## Examples

### Example 1: Work Log Entry with Two-Level Learning

```markdown
## October 27, 2025

### 02:45 PM [milestone]
#### P3 File Creation Complete
Completed creation of 5 P3 optimization files (observability, CI/CD, security,
database migrations, performance) totaling ~2,750 lines. All files follow
consistent structure with comprehensive examples, machine-readable validation
checklists, and systematic prevention patterns.

**LEARNING (Level 1 - Content)**:
- Focused P3 files reduce cognitive waste from 78% to 5% (94% improvement)
- Routing confidence improves from 0.70 to 0.95 (36% increase) with domain-specific files
- P3 files have highest systematic prevention density (65% vs 58% in P0)
- All 5 optimization domains covered: observability, CI/CD, security, DB migrations, performance

**LEARNING (Level 2 - Process)**:
- User corrected evaluation criteria: Real metric is "cognitive load on agents at run-time"
  not "time to create files"
- User emphasized: Quality and completeness now, since speed isn't the concern
- Decision-making insight: Solo founder context means long-term quality > short-term speed
- Effective feedback pattern: User stated real criteria explicitly, explained rationale,
  let agent re-analyze with correct criteria
- Collaboration pattern: After decision pivot, user asked "is this proceeding?" to verify
  execution starting (not just planning)
```

**Context**: This entry demonstrates both content learning and process learning.
**Expected Result**: Future agents can learn what was built AND how decisions were made.

### Example 2: Event Tag Usage

```markdown
## October 27, 2025

### 04:15 PM [milestone]
#### Validation Framework Complete
Completed Epic validation standards...

### 02:30 PM [architecture]
#### Routing Service Design
Finalized instruction routing service architecture. Decision: Use Redis cache
with 5-minute TTL based on instruction update frequency analysis...

### 11:00 AM [development]
#### API Gateway Rate Limiting
Implemented token bucket rate limiting with Redis state storage. Achieves
< 5ms latency for rate limit checks...

### 09:15 AM [analysis]
#### Cache Performance Investigation
Analyzed cache hit rates across services. Findings: Routing service 87% hit rate,
instruction registry 92% hit rate...

---

## October 26, 2025

### 05:30 PM [documentation]
#### Instruction File Standards
Updated documentation standards with path reference guidelines...
```

**Context**: Event tags categorize entries enabling filtering and pattern recognition.
**Expected Result**: Agents and humans can quickly identify entry types.

## Validation Checklist

- [ ] Wiki repository validated before adding entry (exists, up-to-date, accessible)
- [ ] Timestamp obtained with timezone validation
- [ ] Entry added to correct monthly file (Work-Log-YYYY-MM.md)
- [ ] Date section found or created (## Month DD, YYYY)
- [ ] Entry inserted at TOP of date section (reverse chronological order)
- [ ] Entry format correct (### Time [tag], #### Title, description)
- [ ] Title concise (3-6 words for scannability)
- [ ] Bidirectional links created (wiki -> GitHub, GitHub -> wiki)
- [ ] **Two-level learning captured (if significant work)**:
  - [ ] Level 1 (Content): Technical knowledge, patterns discovered, measurable outcomes
  - [ ] Level 2 (Process): Decision-making insights, collaboration patterns, meta-learning
- [ ] Sidebar updated if first entry of day (date link added)
- [ ] All changes committed with descriptive message
- [ ] Changes pushed to remote wiki immediately

## Common Pitfalls

### Pitfall 1: Skipping Wiki Validation

- **Problem**: Attempting to add work log entry without validating wiki repository exists
- **Why it happens**: Assumption that wiki is always available
- **Solution**: ALWAYS run validation protocol first; clone if missing; pull latest changes

### Pitfall 2: Forgetting Sidebar Update on First Entry of Day

- **Problem**: Adding first work log entry for new date but not updating sidebar
- **Why it happens**: Focus on entry content without remembering sidebar maintenance
- **Solution**: Check sidebar for current date link; if missing, add at top

### Pitfall 3: One-Way Linking (Wiki -> GitHub Only)

- **Problem**: Work log entry links to GitHub issue but issue doesn't link back to wiki
- **Why it happens**: Focus on wiki documentation without considering GitHub as reference point
- **Solution**: ALWAYS create bidirectional links

### Pitfall 4: Appending Entries to Bottom (Chronological Order)

- **Problem**: Adding new entries at bottom of date section instead of top
- **Why it happens**: Habit from traditional log files
- **Solution**: ALWAYS insert at TOP of date section; newest entries appear first

## Edge Cases

### Edge Case 1: First Entry of New Month

**When**: Adding first work log entry for new month requires creating new file
**Approach**:
1. Create new file following naming convention (e.g., Work-Log-2025-11.md)
2. Copy structure from previous month (breadcrumb navigation, metadata)
3. Update month references in navigation and metadata
4. Add first date section and entry
5. Update Work-Log.md index with link to new month
6. Update sidebar with new month section

### Edge Case 2: Multiple Entries Same Day from Different Agents

**When**: Multiple agents adding work log entries to same date section concurrently
**Approach**:
1. First agent adds entry, commits, and pushes
2. Second agent pulls latest changes before adding entry
3. If merge conflict, resolve by preserving both entries in reverse chronological order
4. Commit merge resolution with both entries included
5. Push to remote

### Edge Case 3: Long Entry Requiring Multiple Paragraphs

**When**: Work log entry content requires substantial detail
**Approach**:
1. Keep entry format (### time [tag], #### title) but expand description
2. Use paragraphs, bullet points, code blocks as needed for clarity
3. Consider linking to separate documentation for extensive technical detail
4. Balance between comprehensive wiki entry and linking to detailed docs

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Wiki directory doesn't exist | Repository not cloned yet | Run validation protocol; clone from GitHub |
| Work log file missing | Wrong month or file not created yet | Create new monthly file |
| Sidebar date links broken | Date anchor format incorrect | Use format: `[[Mon DD\|Work-Log-YYYY-MM#month-dd-yyyy]]` |
| Entry not visible after push | Push failed or incomplete | Verify push completed without errors |
| Merge conflict during push | Concurrent edits | Pull latest; resolve conflicts; commit and push |
| Duplicate date sections | Didn't check for existing section | Search for date pattern before creating |

---

**Success Criteria**: Work log entries added to wiki with validated timestamps, proper formatting, bidirectional links to GitHub artifacts, **two-level learning captured for significant work (content + process)**, sidebar updated for first entry of day, and changes committed and pushed immediately.
