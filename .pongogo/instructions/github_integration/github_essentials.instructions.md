---
pongogo_instruction_spec: "0.0.2"
title: "GitHub Essentials"
description: "Essential GitHub API patterns, integration standards, and MCP tool usage."
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
      - github_issue
      - gh_issue
      - create_issue
      - issue_lifecycle
      - project_board
      - completion_tracking
      - markdown_checkbox
      - delete_issue
      - pull_request_workflow
      - four_dimensions
      - machine-readable
      - issue_verification
    nlp: "Essential GitHub operations, issue lifecycle, completion tracking with markdown checkboxes, and multi-dimensional verification"
evaluation:
  success_signals:
    - Issues created with proper workflow and project assignment
    - Completion tracking uses markdown checkboxes exclusively
    - Multi-dimensional verification before closing (4 dimensions)
    - PR vs direct-main decision follows decision matrix
  failure_signals:
    - Issues created without project assignment
    - Emoji used for completion tracking
    - Issues closed without verifying all 4 dimensions
    - Workflow decision unclear or inconsistent
---


# GitHub Essentials

**Purpose**: Define essential GitHub operations, issue lifecycle management, and machine-readable tracking formats enabling systematic agent execution.

**Philosophy**: Machine-readable formats enable agents to parse progress programmatically without manual interpretation.

---

## When to Apply

Use these standards when:

- Creating or updating GitHub issues for project tasks
- Managing project boards and issue assignments
- Tracking completion status for features or tasks
- Implementing pull request workflows
- Deleting or closing issues to maintain project hygiene
- Setting up completion tracking for acceptance criteria

---

## Quick Reference

**Essential GitHub Workflows**:

**1. Issue Creation (Complete Workflow)**:
```bash
# Step 1: ALWAYS follow task_creation_workflow.instructions.md first
# Step 2: Search existing tasks
gh issue list --label task --state open --search "keyword"

# Step 3: Create issue with template
gh issue create \
  --title "Task: [Description]" \
  --label "task,domain,priority" \
  --body "[Template content]"

# Step 4: Assign to project (MANDATORY)
gh project item-add PROJECT_NUMBER \
  --owner OWNER \
  --url "https://github.com/{owner}/{repo}/issues/ISSUE_NUMBER"

# Step 5: Verify assignment
gh issue view ISSUE_NUMBER --json projectItems
```

**2. Project Assignment (Mandatory Every Time)**:
```bash
# All issues MUST be assigned to project
gh project item-add PROJECT_NUMBER \
  --owner {owner} \
  --url "ISSUE_URL"

# Set initial status
gh project item-edit \
  --project-id PROJECT_ID \
  --id ITEM_ID \
  --field-id STATUS_FIELD_ID \
  --text "Backlog"
```

**3. Machine-Readable Completion Tracking**:
```markdown
# CORRECT: Markdown checkboxes (agents can parse)
## Success Indicators
- [ ] Deliverable 1 completed
- [x] Deliverable 2 completed (marked complete)
- [ ] Deliverable 3 completed

## Acceptance Criteria
- [ ] End-to-end validation complete
- [ ] Quality checks passing

# WRONG: Emoji (not machine-readable)
Deliverable 1 complete
Deliverable 2 incomplete
```

**4. Issue Lifecycle States**:
```
Backlog → Up Next → In Progress → Ready for Review → Done → Closed
                         ↓
                    On Hold (paused)
                         ↓
                    Blocked (temporary state)
```

**5. Pull Request Decision Tree**:
```
Who is doing the work?
├─ Delegated agent? → Use PR workflow (review required)
├─ External contributor? → Use PR workflow (review + approve)
├─ Human + AI pair? → Direct to main (iterative collaboration)
└─ Documentation only? → Direct to main (low risk)
```

**6. Issue Deletion (When Needed)**:
```bash
# Get issue node ID
ISSUE_ID=$(gh api repos/{owner}/{repo}/issues/ISSUE_NUMBER \
  --jq '.node_id')

# Delete issue via GraphQL
gh api graphql -f query='
mutation {
  deleteIssue(input: {issueId: "'$ISSUE_ID'"}) {
    clientMutationId
  }
}'
```

**7. Status Update Workflow**:
```bash
# Update issue status when work begins
gh issue edit ISSUE_NUMBER --add-label "in-progress"

# Update status when work complete
gh issue close ISSUE_NUMBER --reason "completed"
```

**8. Issue Completion Verification (Before Closing)**:
```markdown
Before closing ANY issue, verify ALL four dimensions:

✓ Dimension 1 - Deliverables:
  - Read each acceptance criterion from issue body
  - Verify actual files exist and meet specifications
  - Check code AND documentation deliverables

✓ Dimension 2 - Status Indicators:
  - All checkboxes marked [x]
  - Project board moved to "Done"
  - Work log entry created

✓ Dimension 3 - Cross-Issue Impacts:
  - Update blocked issues when resolving blockers
  - Mark dependent checkboxes complete

✓ Dimension 4 - Knowledge Trail:
  - Work log entry for completion
  - Learning loop if Task/Epic/Milestone
  - Completion comment with evidence

WARNING: Work log timestamps ≠ proof of completion
TRUST: Direct file verification over indirect signals
```

---

## Core Principles

- **Task Workflow First**: Follow task_creation_workflow.instructions.md before creating any GitHub issue
- **Project Assignment Mandatory**: All issues must be assigned to project immediately after creation
- **Machine-Readable Tracking**: Use markdown checkboxes for all completion tracking (never emoji)
- **Lifecycle Clarity**: Close only when complete, delete when obsolete or erroneous
- **Multi-Dimensional Verification**: Before closing, verify deliverables, status sync, cross-issue impacts, and knowledge trail (4 dimensions)
- **Template-Driven**: Use indexed templates for consistent issue structure

## Step-by-Step Guidance

### 1. **Issue Creation Workflow**
   - **ALWAYS follow task_creation_workflow.instructions.md 6-step process first**
   - Search existing tasks for extension opportunities before creating new ones
   - Evaluate relationships to existing work (Epic chains, dependencies)
   - Apply proper naming conventions: `Epic: [Domain] (v[XX])` or `Task: [Description]`
   - Create issues using templates in `.github/ISSUE_TEMPLATE/` directory
   - Expected outcome: Issue created with proper structure and relationships

### 2. **Project Assignment (Mandatory)**
   - Assign ALL issues to GitHub project immediately after creation
   - Use GitHub CLI: `gh project item-add PROJECT_NUMBER --owner OWNER --url "ISSUE_URL"`
   - Set initial status to "Backlog" after project assignment
   - Verify assignment completion before proceeding
   - Expected outcome: Issue visible in project board

### 3. **Issue Lifecycle Management**
   - Update status when work begins: Backlog → In Progress
   - Use project fields for milestone tracking and priority
   - Link related issues and pull requests for context
   - Close issues only when work is successfully completed
   - Delete issues when redundant, erroneous, or made irrelevant
   - Expected outcome: Issue state accurately reflects work status

### 4. **Completion Tracking Standards**
   - Use markdown checkboxes for ALL completion tracking: `- [ ]` and `- [x]`
   - Apply to: Success Criteria, Acceptance Criteria, Phase tracking, Validation sections
   - Update checkbox from `- [ ]` to `- [x]` immediately when work completes
   - Note supporting evidence (commit, PR, wiki entry) in issue comment for audit trail
   - PROHIBITED: Emoji checkmarks for completion tracking
   - Expected outcome: Progress calculable programmatically by agents

### 5. **Issue Completion Verification (Before Closure)**
   - **CRITICAL**: Before closing any issue, verify completion across ALL four dimensions
   - **Dimension 1 - Deliverables**: Systematically check each acceptance criterion against actual files
     - Read acceptance criteria from issue body
     - Verify code deliverables exist and meet specifications (file inspection, not assumption)
     - Verify documentation deliverables complete (README updates, guides, specs)
     - Run tests if applicable
   - **Dimension 2 - Status Indicators**: Synchronize all status locations
     - All checkboxes in issue body marked `[x]`
     - Project board status matches issue state (move to "Done" when closing)
     - Issue state set correctly (closed if complete)
     - Work log entry created for issue completion
   - **Dimension 3 - Cross-Issue Impacts**: Update dependent issues
     - Identify issues this work unblocks
     - Update blocked issue bodies with resolution details
     - Mark blocked issue checkboxes complete where applicable
     - Add section to blocked issues documenting how blocker resolved
   - **Dimension 4 - Knowledge Trail**: Document completion
     - Work log entry created for Task/Epic/Milestone completion
     - Learning loop conducted if applicable
     - Completion comment added to issue with evidence links
     - Retrospective created if significant learnings
   - **Warning**: Work log timestamps, completed code, or conversation history are NOT proof of completion
   - **Trust**: Direct verification (file inspection) over indirect signals (timestamps, assumptions)
   - Expected outcome: True 100% completion verified before closure, no premature closures

### 6. **Pull Request Workflow Decision**
   - Use PR for: Delegated agent tasks, external contributors, major architectural changes, production deployment
   - Use direct main for: Human + AI pair programming, documentation updates, configuration adjustments, iterative development
   - Decision criteria: Who is doing work? Review requirement? Work session type?
   - Expected outcome: Appropriate workflow chosen based on collaboration model

### 7. **Issue Deletion (When Needed)**
   - Use GitHub GraphQL API `deleteIssue` mutation for proper cleanup
   - Command: `gh api graphql -f query='mutation { deleteIssue(input: {issueId: "ISSUE_ID"}) { clientMutationId } }'`
   - Get issue node ID from REST API or URL structure
   - Document rationale in commit messages or related issues
   - Expected outcome: Obsolete issues removed cleanly from project

## Examples

### Example 1: Creating a Feature Task with Proper Workflow

Scenario: Need to add authentication service to application

```bash
# Step 1: Follow task creation workflow (search, evaluate, plan)
gh issue list --search "authentication" --state all

# Step 2: Create issue using template
gh issue create \
  --title "Task: Authentication Service Implementation" \
  --body-file .github/ISSUE_TEMPLATE/task.md \
  --label "feature,backend,p1"

# Step 3: Assign to project (assume project #1)
gh project item-add 1 --owner {owner} --url "https://github.com/{owner}/{repo}/issues/42"

# Step 4: Set initial status
gh project item-edit --project-id PROJECT_ID --id ITEM_ID --field-id STATUS_FIELD_ID --text "Backlog"
```

**Context**: Systematic workflow ensures issue is properly structured, related to existing work, and tracked
**Expected Result**: Issue #42 created, assigned to project, visible in Backlog column

### Example 2: Machine-Readable Completion Tracking

Scenario: Task under Epic requiring progress tracking

```markdown
# [Task]-instruction_file_registry

**Part of**: [Epic]-knowledge_routing (Issue #45)

## Success Indicators
- [x] Registry schema designed and documented
- [x] Routing logic implemented
- [ ] Integration tests passing
- [ ] Documentation complete

## Acceptance Criteria
- [ ] All existing instruction files reviewed
- [ ] Registry schema documented
- [x] registry.json structure created
- [x] Routing logic implemented
- [ ] Integration tests passing with 90%+ coverage
- [ ] Documentation updated in wiki
```

**Context**: Agents can parse markdown checkboxes to calculate: 4/9 complete (44%)
**Expected Result**: Programmatic progress tracking without human interpretation

### Example 3: Pull Request vs Direct Main Decision

Scenario: Determining workflow for documentation update

```markdown
# Decision Matrix

## Scenario A: Agent Delegated Task
- Work type: Cloud agent autonomous execution
- Review: Required for quality gate
- Decision: Pull Request REQUIRED

## Scenario B: Pair Programming Session
- Work type: Human + AI collaborative development
- Review: Real-time during collaboration
- Decision: Direct Main ALLOWED

## Scenario C: Production Hotfix
- Work type: Critical bug fix
- Review: Required for production safety
- Decision: Pull Request REQUIRED
```

**Context**: Clear decision framework prevents workflow confusion
**Trade-offs**: PRs add review gate but enable delegation; direct main speeds iteration but requires real-time collaboration

## Validation Checklist

Before marking GitHub workflow tasks complete:

- [ ] Issue created following task_creation_workflow.instructions.md
- [ ] Issue assigned to project
- [ ] Initial status set to "Backlog"
- [ ] Completion tracking uses markdown checkboxes (not emoji)
- [ ] Related issues linked in issue body
- [ ] Proper naming convention applied
- [ ] Template used for consistent structure
- [ ] PR workflow decision documented when applicable

## Common Pitfalls

### Pitfall 1: Skipping Task Creation Workflow

- **Problem**: Creating GitHub issue directly without systematic planning
- **Why it happens**: Urgency pressure bypasses established process
- **Solution**: ALWAYS follow task_creation_workflow.instructions.md first
- **Example**: Search for existing authentication tasks before creating new authentication issue

### Pitfall 2: Using Emoji for Completion Tracking

- **Problem**: Using emoji instead of markdown checkboxes
- **Why it happens**: Human-readable formats preferred over machine-readable
- **Solution**: Use `- [x]` and `- [ ]` for all completion tracking
- **Example**: Replace "Tests passing" emoji with `- [x] Tests passing`

### Pitfall 3: Missing Project Assignment

- **Problem**: Issue created but not assigned to project
- **Why it happens**: Forgotten step after issue creation
- **Solution**: Immediately assign to project using `gh project item-add`
- **Example**: Every issue creation followed by project assignment command

### Pitfall 4: Closing Instead of Deleting Obsolete Issues

- **Problem**: Closing issues that are actually redundant or erroneous
- **Why it happens**: Unclear distinction between "completed" and "no longer relevant"
- **Solution**: Close when complete, delete when obsolete/redundant/erroneous
- **Example**: Delete duplicate issue rather than closing it

## Edge Cases

### Edge Case 1: Issue Created Before Project Setup

**When**: Issue exists but project board not yet configured
**Approach**:
- Assign to project retroactively when project board is ready
- Use bulk assignment for multiple legacy issues
- Document assignment gap in issue comment
**Example**: `gh project item-add 1 --owner {owner} --url "https://github.com/{owner}/{repo}/issues/1-20"`

### Edge Case 2: Partial Completion Requiring Issue Split

**When**: Issue partially complete but remaining work diverges from original scope
**Approach**:
- Complete and close original issue for work done
- Create new issue for divergent remaining work
- Link issues with "Continuation of #XX" notation
- Update completion tracking to reflect split
**Example**: Close "Authentication Service" after basic auth, create "Advanced Auth Features" for OAuth

### Edge Case 3: Issue Blocked by External Dependency

**When**: Issue cannot progress due to external factor (API availability, third-party service)
**Approach**:
- Add "blocked" label to issue
- Document blocking factor in issue comment
- Update project status to "Blocked" column if available
- Set up notification trigger for unblocking condition
**Example**: "Knowledge routing blocked pending instruction file schema finalization"

---

## Batch Operations Automation

**When**: Performing 5+ repetitive GitHub operations (label creation, issue updates, bulk changes)

**Pattern**: Create bash scripts for batch operations instead of manual UI clicking or individual CLI commands

**Why This Works**:
- **Reliability**: Scripts prevent human error in repetitive operations
- **Speed**: Execute 30+ operations in seconds vs minutes of manual work
- **Validation**: Script serves as documentation and can be re-run for verification
- **Debugging**: Easy to inspect and modify if issues occur

### Approach

**Step 1: Create Script File**
```bash
cat > /tmp/operation_script.sh << 'EOF'
#!/bin/bash
set -e  # Exit on error

echo "Starting batch operation..."

# Your operations here
gh label create "label-name" --color "FF0000" --description "Description"
# ... repeat for all items

echo "Batch operation complete!"
EOF
chmod +x /tmp/operation_script.sh
```

**Step 2: Execute**
```bash
/tmp/operation_script.sh
```

**Step 3: Validate**
```bash
# Verify results with appropriate gh commands
gh label list
gh issue list --json number,labels
```

### When to Use

**Use Scripts When**:
- 5+ similar operations needed
- Consistency critical (labels, bulk updates)
- Need validation trail
- Operations complex enough to make errors likely

**Use Manual/Single Commands When**:
- 1-2 operations only
- Interactive decisions needed per item
- Exploratory work (figuring out what to do)

### Anti-Patterns

**Don't**:
- Run individual `gh` commands one-by-one in terminal (error-prone for 5+ operations)
- Use UI clicking for bulk operations (slow, no validation trail)
- Create overly complex scripts for simple operations (2-3 commands better run manually)

### Related

- **Validation**: Always include validation step in script or as separate script
- **Evidence**: Script files serve as documentation of what was done
- **Reproducibility**: Can re-run if needed or adapt for similar tasks

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Issue not appearing in project board | Project assignment missing or failed | Run `gh project item-add` command with correct project ID |
| Completion percentage incorrect | Emoji used instead of markdown checkboxes | Convert all emoji to `- [x]`/`- [ ]` format |
| Cannot delete issue via CLI | GitHub CLI doesn't support deletion | Use GraphQL API: `gh api graphql -f query='mutation { deleteIssue(input: {issueId: "ID"}) }'` |
| PR workflow unclear | Collaboration model ambiguous | Apply decision matrix: delegated → PR, pair programming → direct main |
| Issue templates not rendering | Template syntax error or missing | Validate YAML structure in `.github/ISSUE_TEMPLATE/` |

## Related Instructions

- **Prerequisites**: [task_creation_workflow.instructions.md](../project_management/task_creation_workflow.instructions.md) - Complete before creating any GitHub issue
- **See also**: [trust_based_task_execution.instructions.md](../trust_execution/trust_based_task_execution.instructions.md) - Trust-based task execution using markdown checkboxes
- **Next steps**: [github_sub_issues.instructions.md](./github_sub_issues.instructions.md) - Advanced tracking for 10+ execution items
- **See also**: [glossary_maintenance.instructions.md](../project_management/glossary_maintenance.instructions.md) - Keeping glossary current and complete

---

**Success Criteria**: GitHub issues created systematically with proper project assignment, machine-readable completion tracking, and appropriate workflow (PR vs direct main) enabling programmatic progress calculation.

**Confidence Check**: Can agents parse completion status without human interpretation? Are all issues assigned to project? Does completion tracking use markdown checkboxes exclusively?
