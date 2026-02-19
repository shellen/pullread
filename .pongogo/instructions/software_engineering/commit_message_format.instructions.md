---
pongogo_instruction_spec: "0.0.2"
title: "Commit Message Format Standards"
description: "Commit message formatting standards and conventions for consistent history."
applies_to:
  - "**/*"
domains:
  - "software_engineering"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - commit_message
      - commit_format
      - git_commit
      - model_attribution
      - Co-Authored-By
      - archaeological
      - context-rich_commit
      - What_Changed
      - Why_section
      - imperative_mood
    nlp: "Creating context-rich commit messages with model attribution and archaeological value for future decision understanding"
evaluation:
  success_signals:
    - Summary line 50-72 chars in imperative mood
    - What Changed and Why sections present with specifics
    - Model attribution and Co-Authored-By footer included
    - Archaeological value preserved (future self can understand)
  failure_signals:
    - Vague summary like "update files" or "fix bug"
    - Missing Why section (rationale not documented)
    - Missing model attribution footer
    - Placeholder text in commit message
---


# Commit Message Format Standards

**Purpose**: Create commit messages that provide comprehensive context for future archaeology - understanding not just what changed, but why, how, and who (including which AI model) contributed.

**Philosophy**: Commit messages are archaeological artifacts. Future developers (including you) will need to understand decisions, not just changes.

**Core Problem Solved**: "Why was this change made?" "What was the context?" "Which model worked on this code?"

---

## Quick Reference

### Standard Format Template

```
Brief summary line (50-72 chars)

## Section 1: What Changed
- Bullet point 1
- Bullet point 2

## Section 2: Why
- Rationale 1
- Rationale 2

## Metrics (if applicable)
- Quantifiable outcome 1
- Quantifiable outcome 2

Generated with [AI Tool] using [Model Name]

Co-Authored-By: [Model Name] <noreply@example.com>
```

### Minimal Format (Small Changes)

```
Brief summary line

Single paragraph explaining change rationale.

Generated with [AI Tool] using [Model Name]

Co-Authored-By: [Model Name] <noreply@example.com>
```

---

## Core Principles

- **Context Over Brevity**: Comprehensive context more valuable than short messages
- **Structured Format**: Sections (What/Why/Metrics) improve scannability
- **Evidence-Based**: Include metrics, file counts, quantifiable outcomes
- **Model Attribution**: Identify which AI model contributed (debugging, capability tracking)
- **Archaeological Trail**: Future self needs to understand decisions, not just changes
- **Imperative Mood**: "Add feature" not "Added feature" or "Adds feature"

---

## When to Apply

**Always**:
- All commits (no exceptions)
- Feature additions
- Bug fixes
- Refactoring
- Documentation updates
- Configuration changes

**Format Selection**:
- **Standard format**: Complex changes, multiple files, strategic decisions
- **Minimal format**: Small changes, single file, obvious rationale
- **Extended format**: Strategic checkpoints, learning integration, architectural decisions

---

## Standard Format (Detailed)

### Summary Line

**Purpose**: One-line description of change that appears in `git log --oneline`

**Guidelines**:
- **Length**: 50-72 characters (GitHub preview cutoff)
- **Mood**: Imperative ("Add feature" not "Added feature")
- **Content**: What was done, not why (why goes in body)
- **Specificity**: Concrete action, not vague descriptor

**Examples**:
```
Good:
Add retry logic to API client
Fix race condition in async handler
Update Pattern Library with validation checkpoints

Bad (too vague):
Update files
Make changes
Fix bug
Improve code
```

---

### Body Structure

#### Section 1: What Changed

**Purpose**: Enumerate specific changes made in this commit

**Format**:
```markdown
## What Changed
- Created validation_framework.py (127 lines)
- Updated 6 templates with new validation section
- Added validation pattern to Pattern Library
- Updated workflow guide with new steps
```

**Guidelines**:
- Bullet list format (easy to scan)
- File names with line counts (scope indication)
- Section names for docs/wiki (navigation aid)
- Versions if applicable

---

#### Section 2: Why

**Purpose**: Explain rationale - why was this change necessary?

**Format**:
```markdown
## Why
- Previous approach caused data inconsistency under concurrent access
- New pattern prevents race conditions by using atomic operations
- Follows established patterns from similar systems
```

**Guidelines**:
- Answer "why now?" and "why this way?"
- Reference evidence (issues, retrospectives)
- Connect to broader context (patterns, principles)
- Include trade-offs if applicable

---

#### Section 3: Metrics (Optional)

**Purpose**: Quantify impact of change

**Format**:
```markdown
## Metrics
- Response time reduced from 500ms to 50ms (90% improvement)
- 3 test files created (127, 83, 241 lines)
- Test coverage increased from 85% to 92%
```

**When to Include**:
- File size changes
- Performance improvements
- Quality improvements (test coverage, error rates)
- Refactoring scope (files touched, lines changed)

---

### Footer: Model Attribution

**Purpose**: Identify which AI model contributed to this code

**Format**:
```markdown
Generated with [AI Tool] using [Model Name]

Co-Authored-By: [Model Name] <noreply@example.com>
```

**Why Model Attribution Matters**:
1. **Debugging**: Different models have different capabilities/limitations
2. **Capability Tracking**: Which models worked on which components
3. **Credit**: Acknowledge AI contribution explicitly
4. **Archaeology**: Understand context of code decisions

---

## Format Variations

### Minimal Format (Small Changes)

**When to Use**:
- Single file changes
- Obvious rationale
- No strategic significance
- Quick fixes

**Example**:
```
Fix typo in Pattern Library

Corrected "occurance" to "occurrence" in validation section.
No functional changes.

Generated with Claude Code using Claude Sonnet

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
```

---

### Extended Format (Strategic Checkpoints)

**When to Use**:
- Strategic checkpoints
- Learning integration
- Architectural decisions
- Milestone completions

**Template**:
```
Brief summary line

## Context
[Why this work was needed, broader picture]

## What Changed
- Major change 1
- Major change 2

## Why
- Strategic rationale 1
- Strategic rationale 2

## Learning Integration
- Pattern 1: [Evidence] -> [Integration]
- Pattern 2: [Evidence] -> [Integration]

## Metrics
- Quantifiable outcome 1
- Quantifiable outcome 2

## Next Steps (optional)
- Follow-up action 1
- Follow-up action 2

Generated with [AI Tool] using [Model Name]

Co-Authored-By: [Model Name] <noreply@example.com>
```

---

## Examples

### Example 1: Feature Addition

```
Add retry logic to API client

## What Changed
- Added exponential backoff retry wrapper to api_client.py
- Updated tests with retry scenarios (5 new tests)
- Added retry configuration to config.yaml

## Why
- Production API calls occasionally timeout (3% failure rate)
- Immediate failures cause user-visible errors
- Retry with backoff provides resilience without overwhelming API

## Metrics
- Failure rate reduced from 3% to 0.5% (83% improvement)
- Average retry count: 1.2 attempts per successful request
- P99 latency increased 200ms (acceptable trade-off)

Generated with Claude Code using Claude Sonnet

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
```

---

### Example 2: Bug Fix

```
Fix race condition in async request handler

## What Changed
- Added mutex lock to request_queue in async_handler.py
- Updated 3 tests to verify thread-safety

## Why
- Users reported "duplicate request processed" errors
- Root cause: Multiple threads accessing request_queue concurrently
- Mutex ensures only one thread modifies queue at a time

## Metrics
- "Duplicate request" errors: 5 reports -> 0 reports (post-fix)
- Lock contention: < 1ms average wait time (negligible impact)

Generated with Claude Code using Claude Sonnet

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
```

---

### Example 3: Refactoring

```
Extract validation logic to separate module

## What Changed
- Created validation.py with 6 validation functions
- Refactored api_handler.py to use validation module (-147 lines)
- Refactored data_processor.py to use validation module (-89 lines)
- Added 12 validation tests

## Why
- Validation logic duplicated across 3 modules (DRY violation)
- Inconsistent validation (email regex differed between modules)
- Centralized validation enables consistent rules and easier testing

## Metrics
- Duplication eliminated: 236 lines removed, 94 lines created (net -142)
- Test coverage: 85% -> 92%
- Validation consistency: 3 implementations -> 1 canonical

Generated with Claude Code using Claude Sonnet

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
```

---

## Validation Checklist

**Before committing**:

### Summary Line
- [ ] 50-72 characters
- [ ] Imperative mood ("Add" not "Added")
- [ ] Specific action, not vague
- [ ] Descriptive of what changed

### Body
- [ ] What Changed section (bullet list)
- [ ] Why section (rationale with evidence)
- [ ] Metrics section (if applicable)
- [ ] Sections clearly labeled
- [ ] Evidence references where relevant

### Footer
- [ ] Model attribution present
- [ ] Model name accurate
- [ ] Co-Authored-By format correct

### Overall
- [ ] Archaeological value (future self can understand context)
- [ ] No placeholder text ("TODO", "TBD")
- [ ] Quantifiable metrics where possible

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Summary line too long | Too much detail in summary | Move detail to body |
| Body feels empty | Minimal changes | Use minimal format for small changes |
| "What Changed" vs "Why" confused | Unclear distinction | What = enumeration, Why = rationale |
| Metrics section unclear | Uncertain what to measure | File counts, size changes, test coverage |

---

**Success Criteria**: Commits provide context-rich messages with proper structure, model attribution, and archaeological value for future understanding.
