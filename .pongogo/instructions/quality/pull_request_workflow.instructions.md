---
pongogo_instruction_spec: "0.0.2"
title: "Pull Request Workflow"
description: "Pull request workflow with mandatory review checklist and quality gates."
applies_to:
  - "**/*"
domains:
  - "quality"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

enforcement:
  scope: session
  blocked_tools:
    - mutating
  blocked_until:
    - action_type: read_instruction
routing:
  priority: 1
  triggers:
    keywords:
      - pull_request
      - PR_workflow
      - PR_template
      - PR_description
      - CI_quality_gates
      - squash_merge
      - small_focused_PR
      - PR_checklist
      - merge_decision
      - feature_branch
    nlp: "Pull request workflow standards including creation, description templates, CI gates, review process, and quality gates"
evaluation:
  success_signals:
    - PR uses template with complete description
    - PR linked to GitHub issue
    - CI gates passing before review requested
    - PR size under 400 lines (focused change)
    - Squash merge with clean commit message
  failure_signals:
    - PR created without template or description
    - CI failing when review requested
    - Large multi-purpose PR (2000+ lines)
    - Force-push during active review
    - PR not linked to issue
---


# Pull Request Workflow Standards

**Purpose**: Establish comprehensive PR workflow ensuring quality, traceability, and systematic integration of changes through standardized processes and quality gates.

**Philosophy**: PRs are quality checkpoints - every PR represents complete, tested, reviewed work ready for production.

---

## When to Apply

Use this PR workflow when:

- Creating pull requests for any code changes
- Preparing features, bug fixes, or refactorings for review
- Integrating work into main branch
- Setting up CI/CD quality gates

---

## Quick Reference

**Key PR Workflow Patterns (Templates & Process)**:

**1. PR Description Template**:
```markdown
## Summary
[1-3 sentence description of what this PR does]

Fixes #[issue-number]

## Changes
- Added confidence scoring to routing service
- Implemented pattern matching
- Added integration tests

## Test Plan
- [x] Unit tests added/updated
- [x] Integration tests added/updated
- [x] Manual testing completed
- [x] All tests passing
- [x] CI passing

## Checklist
- [x] Code follows style guide
- [x] Tests added for new functionality
- [x] Type checking passes
- [x] Linting passes
- [x] Documentation updated
- [x] No breaking changes

🤖 Generated with Claude Code using Claude Sonnet 4.5

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**2. PR Title Format**:
```
# Format: [type] Brief description (#issue)

✅ Good:
feat: Add confidence scoring to routing (#123)
fix: Handle null values in pattern matcher (#124)
refactor: Extract validation logic (#125)
docs: Update API documentation (#126)
test: Add integration tests (#127)
chore: Update dependencies (#128)

❌ Bad:
Update code
Fix bug
Changes
```

**3. Small, Focused PR Guidelines**:
```
❌ BAD: Large PR
Files: 45 changed
Lines: +2,847 / -1,234
Scope: Feature + refactor + docs + fixes

✅ GOOD: Small PRs
PR 1: feat: Pattern matching (#123)
  Files: 5, Lines: +287 / -12

PR 2: refactor: Extract types (#124)
  Files: 8, Lines: +156 / -203

PR 3: docs: API documentation (#125)
  Files: 2, Lines: +89 / -3

Target: <400 lines per PR
```

**4. CI Quality Gates**:
```yaml
# Required checks before merge:

✓ Type Check (tsc --noEmit)
✓ Lint (npm run lint)
✓ Unit Tests (npm test)
✓ Integration Tests (npm run test:integration)
✓ Build (npm run build)
✓ Coverage ≥80%

# All must pass ✅ before merge allowed
```

**5. PR Workflow Timeline**:
```
Day 0: Create PR → Self-Review → Fix CI
  │
  ├─ Draft PR for WIP
  └─ Ready for Review when CI green

Day 1: Request Review (within 24h)
  │
  ├─ Reviewer 1: Approve ✅
  └─ Reviewer 2: Request Changes 🔄

Day 2: Address Feedback → Push Changes
  │
  └─ Re-request Review

Day 2-3: Final Approval → Merge
  │
  ├─ Squash and Merge (preferred)
  └─ Delete Branch
```

**6. Review Response Pattern**:
```markdown
# Reviewer: "Consider extracting this function"

❌ Bad: "It's fine."

✅ Good: "Great suggestion! Extracted to
`validateRequest()` in commit abc123.
Now easier to test. LMKIF!"
```

**7. Pre-PR Self-Review Checklist**:
```bash
# Before creating PR:
git diff main...HEAD  # Review all changes
npm run typecheck      # Check types
npm run lint           # Check style
npm test               # Run tests
git log --oneline      # Review commits

# Remove before committing:
- console.log / debugger statements
- Commented-out code blocks
- TODOs without GitHub issues
- Unused imports
- Debug configuration
```

**8. Merge Decision Tree**:
```
Ready to merge?
├─ CI passing? NO → Fix CI first
├─ 2+ approvals? NO → Wait for approvals
├─ All feedback addressed? NO → Address comments
├─ Conflicts? YES → Resolve conflicts
└─ All YES → ✅ Squash and Merge
    └─ Delete branch after merge
```

**9. Common PR Commands**:
```bash
# Create PR via CLI
gh pr create --title "feat: Add feature" --body-file pr-template.md

# Checkout PR for review
gh pr checkout 123

# Check PR status
gh pr view 123

# List open PRs
gh pr list

# Merge PR (after approval)
gh pr merge 123 --squash --delete-branch

# Re-request review after changes
gh pr ready 123
```

---

## Core Principles

- **Small, Focused PRs**: One logical change per PR (<400 lines preferred)
- **Complete Context**: PR description explains what, why, and how
- **CI Gates Pass**: All tests, linting, type checking pass before review
- **Self-Review First**: Review own changes before requesting review
- **Draft for WIP**: Use draft PRs for work-in-progress, convert when ready
- **Link to Issues**: Every PR links to GitHub issue/task
- **Machine-Readable Checklists**: Use checkboxes for validation steps
- **Squash-Merge Preferred**: Clean commit history on main

## Step-by-Step Guidance

### 1. **Create Feature Branch**
   - Branch from main: `git checkout -b feature/routing-confidence-scoring`
   - Use descriptive branch names: `feature/`, `fix/`, `refactor/`
   - Expected outcome: Feature branch created from latest main

### 2. **Make Commits**
   - Small, logical commits with clear messages
   - Follow commit message format (see git_safety.instructions.md)
   - Run tests before each commit
   - Expected outcome: Clean commit history documenting work

### 3. **Self-Review Changes**
   - Review own diff before creating PR
   - Check for debug code, console.logs, TODOs
   - Verify tests added/updated
   - Run full CI suite locally
   - Expected outcome: Changes ready for external review

### 4. **Create Pull Request**
   - Use PR template (see examples)
   - Write clear title and description
   - Link to GitHub issue
   - Add machine-readable checklist
   - Request reviewers
   - Expected outcome: Complete PR ready for review

### 5. **Address CI Failures**
   - Fix any CI failures immediately
   - Don't request review until CI green
   - Push fixes, CI re-runs automatically
   - Expected outcome: All CI gates passing

### 6. **Respond to Review Feedback**
   - Address all review comments
   - Push new commits (don't force-push during review)
   - Re-request review after changes
   - Expected outcome: All feedback addressed

### 7. **Merge When Approved**
   - Squash and merge (preferred)
   - Use generated squash commit message
   - Delete branch after merge
   - Expected outcome: Changes integrated into main, branch cleaned up

## Examples

### Example 1: PR Template

Standard PR description template:

```markdown
## Summary

Brief description of what this PR does (1-3 sentences).

Fixes #[issue-number]

## Changes

- Added confidence scoring to routing service
- Implemented pattern matching with glob library
- Added integration tests for routing endpoint
- Updated API documentation

## Test Plan

- [x] Unit tests added/updated
- [x] Integration tests added/updated
- [x] Manual testing completed
- [x] All tests passing locally
- [x] CI pipeline passing

## Screenshots/Examples

<!-- If UI changes, include before/after screenshots -->
<!-- If API changes, include curl examples -->

```bash
# Example API request
curl -X POST http://localhost:3001/v1/route \
  -H "Content-Type: application/json" \
  -d '{"type": "file_path", "value": "services/routing/index.ts"}'

# Response
{
  "instructions": [
    {
      "path": "knowledge/instructions/routing/routing_service.md",
      "confidence": 0.95,
      "reason": "File path matches applies_to pattern"
    }
  ]
}
```

## Checklist

- [x] Code follows project style guide
- [x] Tests added for new functionality
- [x] All tests passing (unit + integration)
- [x] Type checking passes (`tsc --noEmit`)
- [x] Linting passes (`npm run lint`)
- [x] Documentation updated
- [x] No breaking changes (or documented if unavoidable)
- [x] Performance impact considered
- [x] Security implications reviewed

## Deployment Notes

<!-- Any special deployment considerations -->
- No database migrations required
- No environment variable changes
- Safe to deploy immediately after merge

---

🤖 Generated with Claude Code using Claude Sonnet 4.5

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**IMPORTANT**: PR descriptions MUST include model attribution for accurate tracking. Model name is read from `~/.claude/settings.json` configuration.

**Context**: Template provides structure for complete PR descriptions
**Expected Result**: Consistent, comprehensive PR documentation

### Example 2: PR Title Format

Clear, descriptive PR titles:

```
# Format: [Type] Brief description (#issue-number)

✅ Good Examples:
feat: Add confidence scoring to routing service (#123)
fix: Handle null values in pattern matcher (#124)
refactor: Extract validation logic into separate module (#125)
docs: Update API documentation for routing endpoint (#126)
test: Add integration tests for semantic matching (#127)
chore: Update dependencies to latest versions (#128)

❌ Bad Examples:
Update code
Fix bug
Changes
WIP
asdf
```

**Context**: Standardized titles enable filtering and changelog generation
**Expected Result**: Scannable PR list, clear purpose at a glance

### Example 3: Small, Focused PR

Keep PRs small and focused:

```
# ❌ BAD: Large, multi-purpose PR
PR: Implement routing service, refactor types, update docs, fix bugs

Files changed: 45
Lines: +2,847 / -1,234

Changes:
- New routing service implementation
- Refactored all type definitions
- Updated 15 documentation files
- Fixed 3 unrelated bugs
- Updated dependencies
- Changed logging format

# ✅ GOOD: Small, focused PRs
PR 1: feat: Implement pattern matching for routing service (#123)
Files changed: 5
Lines: +287 / -12

PR 2: refactor: Extract routing types to shared module (#124)
Files changed: 8
Lines: +156 / -203

PR 3: docs: Add routing service API documentation (#125)
Files changed: 2
Lines: +89 / -3

PR 4: fix: Handle empty file paths in pattern matcher (#126)
Files changed: 2
Lines: +15 / -8
```

**Context**: Small PRs are easier to review, faster to merge, safer to deploy
**Expected Result**: PRs reviewed same day, less risk

### Example 4: CI Quality Gates

Required CI checks before merge:

```yaml
# .github/workflows/pr-checks.yml
name: PR Quality Gates

on:
  pull_request:
    branches: [main]

jobs:
  # Gate 1: Type Checking
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run typecheck
      # Fail PR if type errors

  # Gate 2: Linting
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      # Fail PR if lint errors

  # Gate 3: Unit Tests
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      # Fail if coverage < 80%

  # Gate 4: Integration Tests
  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration

  # Gate 5: Build
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      # Fail if build errors

  # All gates must pass for merge
  all-checks:
    needs: [typecheck, lint, test-unit, test-integration, build]
    runs-on: ubuntu-latest
    steps:
      - run: echo "All quality gates passed ✅"
```

**Context**: Automated quality gates prevent broken code merging
**Expected Result**: Only high-quality code reaches main branch

### Example 5: Review Response Pattern

Professional review feedback responses:

```markdown
# Reviewer Comment:
> This function is doing too much. Consider extracting the validation logic.

# ❌ Bad Response:
"It's fine as is."

# ✅ Good Response:
"Good catch! I've extracted the validation logic into a separate `validateRequest()` function in commit abc123. The function now has a single responsibility and is easier to test. Let me know if this addresses your concern."

---

# Reviewer Comment:
> What happens if the pattern array is empty?

# ❌ Bad Response:
"It won't be empty."

# ✅ Good Response:
"Great question! I've added a guard clause to handle empty arrays (commit def456) and added a test case for this edge case (commit ghi789). The function now returns an empty array if no patterns provided."

---

# Reviewer Comment:
> Can we add types for these parameters?

# ❌ Bad Response:
"Fixed."

# ✅ Good Response:
"Absolutely - added full type annotations for all parameters and return type in commit jkl012. Also ran `tsc --noEmit` to verify no type errors."
```

**Context**: Clear responses improve collaboration and review efficiency
**Expected Result**: Fast review cycles, mutual learning

## Validation Checklist

Before creating PR:

- [ ] Branch created from latest main
- [ ] Commits are small and logical
- [ ] Commit messages follow format
- [ ] Tests added/updated for changes
- [ ] All tests passing locally
- [ ] Type checking passes
- [ ] Linting passes
- [ ] No debug code (console.log, debugger)
- [ ] No commented-out code
- [ ] No TODOs without GitHub issues
- [ ] Self-reviewed diff

Before requesting review:

- [ ] PR description complete (using template)
- [ ] Linked to GitHub issue
- [ ] CI passing (all gates green)
- [ ] Screenshots/examples included (if applicable)
- [ ] Breaking changes documented
- [ ] PR size reasonable (<400 lines preferred)

Before merging:

- [ ] All review comments addressed
- [ ] All reviewers approved
- [ ] CI still passing after latest changes
- [ ] Conflicts resolved
- [ ] Squash commit message clean

## Common Pitfalls

### Pitfall 1: Large, Multi-Purpose PRs

- ❌ **Problem**: 2,000+ line PRs mixing features, refactoring, docs
- **Why it happens**: Not breaking work into focused changes
- ✅ **Solution**: One logical change per PR, max 400 lines
- **Example**: PR with new feature + refactoring + bug fixes

### Pitfall 2: Creating PR with Failing CI

- ❌ **Problem**: Requesting review while CI red
- **Why it happens**: Not running tests locally first
- ✅ **Solution**: Fix CI before requesting review
- **Example**: PR with failing tests, reviewer wastes time

### Pitfall 3: Vague PR Descriptions

- ❌ **Problem**: PR title "Update code" with no description
- **Why it happens**: Not using PR template
- ✅ **Solution**: Use template, explain what/why/how
- **Example**: Reviewer can't understand purpose of changes

### Pitfall 4: Force-Pushing During Review

- ❌ **Problem**: Force-push rewrites history, breaks review flow
- **Why it happens**: Trying to clean up commits during review
- ✅ **Solution**: Add new commits during review, squash at merge
- **Example**: Reviewer loses track of what changed since last review

### Pitfall 5: Not Linking to Issues

- ❌ **Problem**: PR not connected to GitHub issue/task
- **Why it happens**: Forgetting to add "Fixes #123"
- ✅ **Solution**: Always link PRs to issues for traceability
- **Example**: Can't understand context or priority of PR

## Edge Cases

### Edge Case 1: Emergency Hotfix

**When**: Production bug requires immediate fix
**Approach**:
- Create hotfix branch from main
- Minimal fix only (no refactoring)
- Fast-track review (1 approver minimum)
- Merge immediately after approval
- Create follow-up issue for proper fix
**Example**: Routing service returning 500 for all requests

### Edge Case 2: Breaking Changes

**When**: PR includes breaking API changes
**Approach**:
- Document all breaking changes in PR description
- Include migration guide
- Version bump (major version)
- Coordinate with dependent services
**Example**: Changing RoutingRequest schema

### Edge Case 3: Large Refactoring

**When**: Refactoring touches many files but preserves behavior
**Approach**:
- Break into multiple PRs if possible
- Comprehensive test coverage before starting
- Mark as "refactor:" in title
- Emphasize behavior preservation in description
**Example**: Extracting shared utilities to library

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| PR sits unreviewed for days | Too large or unclear | Break into smaller PRs, improve description |
| CI keeps failing | Not running tests locally | Run full CI suite locally before pushing |
| Review feedback unclear | Missing context | Ask clarifying questions, iterate |
| Conflicts on every push | Branch out of date | Regularly merge main into feature branch |
| Can't merge after approval | CI failed on latest commit | Fix CI, request re-approval if needed |
| PR reverted after merge | Broke production | Add integration tests, stage testing |
| Lost track of review changes | Force-pushed during review | Don't force-push, add new commits |

## Related Instructions

**Core Workflow**:
- [Code Review Standards](./code_review_standards.instructions.md) - Review process, feedback standards, approval criteria
- [CI/CD Pipelines](../devops/ci_cd_pipelines.instructions.md) - CI quality gates (typecheck, lint, test, build)
- [Git Safety](../safety_prevention/git_safety.instructions.md) - Safe git practices, avoiding force-push, branch management

**Quality Requirements**:
- [Testing Standards](./testing_standards.instructions.md) - Test coverage requirements before PR
- [Test-Driven Development](../development_standards/test_driven_development.instructions.md) - Writing tests for PR changes
- [Deterministic Validation Framework](../validation/deterministic_validation_framework.instructions.md) - Validation requirements in CI

**Integration**:
- [GitHub Integration](../github_integration/github_essentials.instructions.md) - GitHub PR workflow, branch protection
- [Database Migrations](../devops/database_migrations.instructions.md) - Including migrations in PRs, migration review checklist
- [Security Hardening](../security/security_hardening.instructions.md) - Security review in PRs

---

**Success Criteria**: All PRs use template, link to issues, pass CI before review, are <400 lines, get reviewed within 24 hours, merge with squash commits.

**Confidence Check**: Does every PR have complete description? Are all CI gates passing before review? Is PR size manageable? Are changes focused on one logical change?
