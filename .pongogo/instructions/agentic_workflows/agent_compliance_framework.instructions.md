---
pongogo_instruction_spec: "0.0.2"
title: "Agent Compliance Framework"
description: "Meta-framework for agent compliance, governance, and operational transparency."
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
      - compliance
      - violation
      - policy_violation
      - shortcut
      - transparency
      - pre-execution_check
      - enforcement_mechanism
      - instruction_adherence
      - unauthorized_substitution
      - process_compliance
      - GitHub_projects_pre-flight
      - comment_gatekeeper
      - internalization_pause
    nlp: "Ensuring agents follow explicit instructions, policies, and processes without unauthorized shortcuts or substitutions"
evaluation:
  success_signals:
    - All 6 pre-execution checklist questions answered before work
    - Enforcement mechanisms followed with documented evidence
    - Zero undisclosed shortcuts or substitutions
    - User confirms satisfaction with compliance and transparency
  failure_signals:
    - Work started without pre-execution checklist
    - Enforcement evidence missing from output
    - Hidden shortcuts discovered after execution
    - User correction signals ignored
---


# Agent Compliance Framework

**Purpose**: Establish systematic compliance checks ensuring agents follow explicit user instructions, institutional policies, and established processes without unauthorized substitutions or shortcuts.

**Philosophy**: Trust is built through compliance with explicit guidance - perceived "optimizations" that bypass instructions violate trust and degrade work quality.

---

## When to Apply

**CRITICAL**: Apply this framework BEFORE executing ANY work.

This instruction applies when:

- **Beginning any work session**: Validate understanding and compliance approach before first action
- **Receiving explicit user instructions**: Systematic process, step-by-step guidance, or specific requirements
- **Tempted to "optimize" or shortcut**: Perceived efficiency improvement that deviates from instructions
- **Encountering existing systematic work**: Analysis files, templates, established processes
- **Confused about requirements**: Ambiguous instructions, multiple interpretations, or unclear expectations
- **Creating GitHub Issues/PRs**: Before creating issues, validate templates, naming conventions, structure
- **Modifying files**: Before editing CLAUDE.md, instruction files, or any state-changing operation

**Anti-Patterns to Prevent**:
- **Optimization Substitution**: Replacing explicit instructions with perceived improvements (see Pattern Library)
- **Transparency Failure**: Taking shortcuts without disclosure (see Pattern Library)
- **Execution Without Understanding**: Proceeding despite confusion about requirements

---

## Quick Reference

**Pre-Execution Compliance Checklist**:

**Before starting work, answer these 6 critical questions**:

1. **Instruction Adherence**: "Am I following explicit user instructions exactly?"
   - ✅ YES → Proceed
   - ❌ NO → Stop, ask for clarification or approval

2. **Process Substitution Check**: "Have I substituted any 'optimizations' for explicit instructions?"
   - ✅ NO substitutions → Proceed
   - ❌ YES substitutions → Disclose and get approval first

3. **Existing Work Trust**: "Am I using existing analysis/work rather than recreating?"
   - ✅ YES using existing → Proceed
   - ❌ NO recreating → Validate why recreation needed

4. **Confusion Detection**: "Am I confused about any requirements?"
   - ✅ NO confusion → Proceed
   - ❌ YES confused → Use AskUserQuestion before executing

5. **Shortcut Transparency**: "Am I taking any shortcuts?"
   - ✅ NO shortcuts → Proceed
   - ❌ YES shortcuts → Explicitly disclose and get approval

6. **Policy Compliance**: "Does this approach comply with institutional policies (CLAUDE.md, instruction files)?"
   - ✅ YES complies → Proceed
   - ❌ NO violations → Adjust approach or seek approval

**If ANY answer triggers STOP condition → Do not execute work until resolved**

---

## Core Principles

- **Explicit Instructions Are Binding**: User instructions take precedence over perceived "optimizations" or efficiency improvements - no substitutions without approval

- **Transparency Builds Trust**: Disclose all shortcuts, assumptions, and deviations explicitly before executing - hidden changes destroy trust

- **Ask When Confused**: Confusion indicates need for clarification, not permission to guess - use AskUserQuestion when uncertain about requirements

- **Trust Existing Work**: When comprehensive systematic analysis exists, use it - don't recreate or shortcut around existing validated work

- **Policy Compliance Is Mandatory**: Institutional policies (CLAUDE.md, instruction files, Pattern Library) are not suggestions - compliance required for all work

---

## Step-by-Step Guidance

### Phase 1: Pre-Work Validation (MANDATORY)

1. **Read and Understand Instructions Completely**
   - Read user's full request without sampling or skipping
   - Identify explicit process requirements
   - Note any sequential dependencies or phase ordering
   - Expected outcome: Complete understanding of requested work

2. **Execute Pre-Execution Checklist**
   - Answer all 6 critical questions from Quick Reference
   - Document any STOP conditions identified
   - Resolve STOP conditions before proceeding
   - Success indicator: All 6 questions pass without STOP triggers

3. **Identify Existing Systematic Work**
   - Check for analysis files, templates, established processes
   - Verify existing work is current and applicable
   - Plan to use existing work rather than recreating
   - Common variation: If no existing work, document why creation needed

4. **Validate Understanding With User** (if any uncertainty)
   - Use AskUserQuestion to clarify ambiguous requirements
   - Confirm multi-phase process sequencing
   - Validate assumptions before acting on them
   - Integration point: User approval enables Phase 2 execution

### Phase 2: Compliant Execution

5. **Follow Explicit Instructions Exactly**
   - Execute steps in specified order
   - Use specified tools and processes
   - Respect phase boundaries and dependencies
   - Rationale: Exact adherence prevents violations and rework

6. **Use Institutional Resources**
   - Use proper templates from docs/templates/
   - Query knowledge routing MCP for standards when creating issues
   - Follow CLAUDE.md policies (naming validation, checkbox tracking, etc.)
   - Success indicator: Templates used, standards validated, policies followed

7. **Maintain Transparency Throughout**
   - State any deviations from instructions explicitly
   - Disclose shortcuts before taking them
   - Communicate assumptions before acting on them
   - Rationale: Continuous transparency enables user correction

### Phase 3: Validation and Completion

8. **Validate Work Against Requirements**
   - Verify all explicit instructions followed
   - Check compliance with institutional policies
   - Confirm no undisclosed shortcuts taken
   - Expected outcome: Work matches requirements exactly

9. **Disclose Any Deviations**
   - Explicitly state where deviated from instructions (if any)
   - Explain rationale for deviations
   - Seek user approval for deviations
   - Success indicator: User satisfied with transparency

10. **Document Compliance**
    - Note what policies were followed
    - Capture any clarifications received
    - Record user approvals for deviations
    - Integration point: Compliance documentation enables trust validation

---

## ENFORCEMENT MECHANISMS (MANDATORY)

**CRITICAL**: Having documentation is insufficient - agents must DEMONSTRATE compliance through evidence.

**Key Insight**: "Available documentation ≠ Consulted documentation"

The following enforcement mechanisms are MANDATORY for all process-related actions:

---

### Mechanism 1: Pre-Execution Compliance Evidence

**REQUIRED**: Before executing ANY process-related action, provide compliance evidence in output.

**Evidence Format**:
```markdown
**Pre-Execution Compliance Evidence**:
- **Process**: [What I'm about to do]
- **Documentation Consulted**: [Instruction file path + key line numbers]
- **Key Requirement**: [Critical requirement from documentation]
- **Compliance Verification**: ✅ [How this action complies]
```

**Example**:
```markdown
**Pre-Execution Compliance Evidence**:
- **Process**: Creating project status update
- **Documentation Consulted**: knowledge/instructions/project_management/project_status_updates.instructions.md (lines 271-276)
- **Key Requirement**: Single paragraph, concise format with Priority Order
- **Compliance Verification**: ✅ Proposed update follows pattern: "Issue #123 (Title) now IN PROGRESS. Priority Order: #123 → #50. Rationale: [why]."
```

**When Required**:
- Moving GitHub Issue to "In Progress" or any status change
- Creating project status updates
- Creating/updating GitHub Issues
- Using comments on GitHub Issues
- Any action following documented procedure

**Success Metric**: 100% of process actions include compliance evidence

---

### Mechanism 2: Documentation Discovery via Routing System

**REQUIRED**: Use knowledge routing system to find relevant documentation BEFORE acting.

**Process**:
```bash
# Step 1: Query routing system
route_instructions(
  message="[description of what I'm about to do]"
)

# Step 2: Read ALL routed instructions
Read each instruction file returned

# Step 3: Document consultation
State which instructions were consulted and key requirements extracted

# Step 4: Execute per documented procedure
```

**Example**:
```markdown
Before moving Issue #123 to "In Progress":

1. Queried: route_instructions(message="moving GitHub issue to in progress status")
2. Routed to: issue_commencement.instructions.md
3. Read: Complete checklist (lines 45-67)
4. Following: All checklist items before status change
```

**When Required**:
- Unfamiliar with documented procedure for an action
- First time performing specific process action
- Any uncertainty about correct procedure

**Success Metric**: Zero violations of documented procedures that were available via routing

---

### Mechanism 3: Comment Usage Gatekeeper

**REQUIRED**: Before adding ANY GitHub comment, answer gatekeeper question.

**Gatekeeper Question**: "Is this defining work to be done?"

**Decision Tree**:
```
Is this defining work to be done?
├─ YES → STOP - Must be Issue body or Sub-Issue, NEVER comment
│         - Task definitions
│         - Acceptance criteria changes
│         - Scope clarifications
│         - New deliverables
│         - Critical requirements
└─ NO → Comment is appropriate
          - Progress updates
          - Context about decisions
          - Blockers encountered
          - Questions for user
          - Completion notifications
          - Meta-comments ("updated issue body")
```

**When Required**: Before EVERY GitHub comment action

**Success Metric**: Zero violations (work items in comments)

---

### Mechanism 4: Internalization Pause

**REQUIRED**: After creating or reviewing policy, pause before acting on related work.

**Process**:
```markdown
1. Create/review policy document
2. Explicitly state: "This means I must [behavior change]"
3. Wait for next message before acting in covered area
4. Self-check before action: "Would this violate policy I just reviewed?"
```

**Example**:
```markdown
Just created policy document (Work Items Must Be Issues)

**Internalization**: This means I must NEVER use GitHub comments for:
- Task definitions
- Acceptance criteria
- Scope changes
- New deliverables

Before my next GitHub comment, I will verify it's NOT defining work.

[PAUSE - wait for next message before any GitHub comment action]
```

**When Required**:
- After creating new policy document
- After creating new instruction file
- After reviewing policy due to violation

**Success Metric**: Zero violations of self-created policies

---

### Mechanism 5: Shortcut Cost Transparency

**REQUIRED**: Before taking ANY shortcut, calculate and disclose true cost.

**Cost Analysis Template**:
```markdown
**Proposed Shortcut**: [What I'm considering skipping]

**Cost Analysis**:
- Time saved by shortcut: [X minutes]
- Risk of violation/rework: [probability %]
- Cost if rework needed: [Y minutes + trust impact]
- Expected cost: [Risk × Rework Cost]
- Net comparison: [Time saved vs Expected cost]

**Decision**: [TAKE shortcut | DON'T TAKE - expected cost exceeds savings]
**User Approval**: [If taking shortcut, request explicit approval]
```

**Example**:
```markdown
**Proposed Shortcut**: Skip reading project_status_updates.instructions.md

**Cost Analysis**:
- Time saved: ~2 minutes (reading time)
- Risk of wrong format: 80% (unfamiliar with pattern)
- Cost if wrong: ~15 minutes (rework + user intervention + trust reduction)
- Expected cost: 0.8 × 15 = 12 minutes
- Net comparison: Save 2 min vs Expect to lose 12 min

**Decision**: DON'T TAKE - expected cost (12 min) >> savings (2 min)
**Action**: Reading documentation now
```

**When Required**:
- Tempted to skip documentation reading
- Considering using simplified version instead of comprehensive template
- Thinking "this is obvious, no need to verify"

**Success Metric**: All shortcuts evaluated with cost analysis, shortcuts with negative expected value rejected

---

### Mechanism 6: Issue Commencement Checklist (Mandatory)

**REQUIRED**: Before moving ANY GitHub Issue to "In Progress", complete full checklist.

**Process**:
1. Read: `docs/templates/issue_commencement_checklist.md`
2. Complete: Every checklist item
3. Document: Add comment to issue noting checklist completion
4. Only Then: Move to "In Progress" status

**Checklist Items** (See full checklist file for complete list):
- [ ] Issue body review
- [ ] Acceptance criteria clarity
- [ ] Dependencies identified
- [ ] Blockers assessed
- [ ] Resources available
- [ ] Documentation consulted
- [ ] Approach validated

**When Required**: Before EVERY status change to "In Progress"

**Success Metric**: 100% of "In Progress" moves include completed checklist

---

### Mechanism 7: File Path Conventions (Project-Specific)

**REQUIRED**: Before creating files in temporary directories, verify project path conventions.

**Critical Distinction**:
- **Project working files**: `tmp/` (project-relative directory)
- **System ephemeral files**: `/tmp/` (system temporary directory, cleared on reboot)

**Pre-Execution Validation**:
```markdown
Before creating ANY temporary file:

1. **Check file purpose**:
   - Analysis, planning, working documents → `tmp/` (project)
   - True ephemeral data (cleared on reboot OK) → `/tmp/` (system)

2. **Verify path convention** (CLAUDE.md "Project-Specific Quirks"):
   - ✅ CORRECT: `tmp/analysis_file.md` → `{project_root}/tmp/analysis_file.md`
   - ❌ WRONG: `/tmp/analysis_file.md` → System temporary directory (data loss risk)

3. **Use absolute path for clarity**:
   - Preferred: `{project_root}/tmp/filename.md`
   - Acceptable: `tmp/filename.md` (project-relative)
   - NEVER: `/tmp/filename.md` (system directory)
```

**Common Mistakes**:
```markdown
❌ WRONG: Write("/tmp/task_validation.md", content)
   - Files in system /tmp/ cleared on reboot (data loss risk)
   - Inconsistent with project organization
   - Cannot be version-controlled/git-ignored

✅ CORRECT: Write("tmp/task_validation.md", content)
   - Files preserved across reboots
   - Project-relative, can be tracked
   - Consistent with project standards
```

**Why This Matters**:
- **Data Loss Risk**: System `/tmp/` cleared on reboot → working files lost
- **Project Organization**: Project `tmp/` files can be version-controlled or intentionally git-ignored
- **Consistency**: Analysis files, migration plans, working documents belong in project structure

**When Required**:
- Creating analysis documents
- Creating execution approach files
- Creating validation documents
- Creating any working file that should persist across sessions

**Reference**:
- CLAUDE.md "Project-Specific Quirks > Temporary Files Directory"

**Success Metric**: Zero files created in system `/tmp/` that should be in project `tmp/`

---

### Mechanism 8: GitHub Projects Operations Pre-Flight (CRITICAL)

**REQUIRED**: Before ANY GitHub Projects operation, execute mandatory pre-flight check with compliance evidence.

**🛑 BLOCKING**: NO GitHub Projects operation may proceed without pre-flight completion.

**Covered Operations**:
- Creating project status updates (`createProjectV2StatusUpdate`)
- Modifying project metadata (`updateProjectV2`)
- Updating custom fields on project items
- Adding/removing items from project
- ANY GraphQL mutation targeting `projectV2` or `projectsV2`

**Mandatory 6-Step Pre-Flight**:
```markdown
1. **STOP**: Do not execute operation yet
2. **Query routing MCP**: route_instructions(message="[operation description]")
3. **Read ALL routed instructions**: Complete files, not summaries
4. **Extract key requirements**: Document critical constraints
5. **Provide compliance evidence**: In output BEFORE operation
6. **Execute per documentation**: Follow discovered procedure exactly
```

**Compliance Evidence Template**:
```markdown
**Pre-Flight Compliance Evidence**:
- **Operation**: [What I'm about to do]
- **Documentation Consulted**: [File paths + line numbers]
- **Key Requirements**: [Critical constraints extracted]
- **Compliance Verification**: ✅ [How this complies]

**Pre-Flight Status**: ✅ COMPLETE - Proceeding with operation
```

**Example** (Status Update Creation):
```markdown
**Pre-Flight Compliance Evidence**:
- **Operation**: Creating project status update for Issue #123 move to In Progress
- **Documentation Consulted**:
  - project_operations_preflight.instructions.md (complete file)
  - project_status_updates.instructions.md (lines 22-38, 75-140)
- **Key Requirements**:
  - Mutation: createProjectV2StatusUpdate (NOT updateProjectV2)
  - Body: "Issue #123 now IN PROGRESS. Priority Order: ... Rationale: ..."
  - Status: ON_TRACK
- **Compliance Verification**: ✅ Using correct mutation, following format

**Pre-Flight Status**: ✅ COMPLETE - Proceeding with GraphQL mutation
```

**Why This Matters**:
- **Root Cause Prevention**: Used `updateProjectV2` instead of `createProjectV2StatusUpdate`
- **Prevention**: Mandatory evidence PROVES consultation occurred

**Anti-Patterns Prevented**:
- Instruction File Write-Only Syndrome
- Prevention Without Enforcement
- Assumption-Based Execution

**Enforcement** (Three-Layer Validation):

**Layer 1 - Routing Verification**:
- Compliance evidence MUST show routing results (UserPromptSubmit hook OR manual MCP query)
- MUST list routed instruction IDs with scores and ranks
- Example: "project_status_updates.instructions (score: 45, rank: #2)"

**Layer 2 - Full File Reading** (CRITICAL - prevents excerpt-only failure):
- Evidence MUST prove full file reading, not just excerpts
- MUST show: "Read [file]: lines 1-[total] ([total] lines)"
- CANNOT show only 500-char excerpt content
- Validation: If evidence shows only excerpt-level detail → VIOLATION (files not fully read)

**Layer 3 - Requirement Extraction**:
- Evidence MUST reference specific line numbers from full files
- Example: "From project_status_updates.instructions (lines 75-140): Use createProjectV2StatusUpdate, NOT updateProjectV2"
- CANNOT show generic requirements (proves files not analyzed)

**When Required**: EVERY TIME before ANY GitHub Projects operation (no exceptions)

**Reference**: [GitHub Projects Operations Pre-Flight](../project_management/project_operations_preflight.instructions.md) - Complete workflow

**Success Metric**: Zero GitHub Projects violations, 100% pre-flight execution rate

---

## Examples

### Example 1: Systematic Migration Execution

**Scenario**: User provides analysis file and says "slowly, methodically, and iteratively through [file]"

**Correct Approach**:
```markdown
**Pre-Execution Check**:
1. Instruction adherence: User said "slowly, methodically, iteratively" → Will read analysis file line-by-line, no scripts
2. Process substitution: No - using specified process exactly
3. Existing work: Analysis file exists → Will use it, not recreate
4. Confusion: None - process is clear
5. Shortcuts: None planned
6. Policy compliance: Complete Context Principle applies → Will read full file

**Execution**:
- Reading analysis file sequentially (File 1/70, File 2/70, etc.)
- Following identified actions for each file
- No extraction scripts or summaries
- Asking clarification if any file entry ambiguous

**Outcome**: User satisfied with exact compliance
```

**Context**: When user provides existing systematic work and explicit process
**Expected Result**: 0% rework, user trust maintained

### Example 2: Detecting and Handling Confusion

**Scenario**: User mentions "bolstering" instruction files but agent unsure if this means adding content TO instruction files FROM CLAUDE.md or vice versa

**Incorrect Approach** (Anti-Pattern):
```markdown
❌ Agent assumes "bolstering" means condensing CLAUDE.md and proceeds with wrong direction
❌ Agent executes work despite confusion
❌ Result: 100% rework required, multiple reverts
```

**Correct Approach**:
```markdown
**Pre-Execution Check**:
1. Instruction adherence: User said "bolster instruction files" → UNCLEAR direction
2. Confusion detected: YES - "bolster" could mean add TO or condense FROM
3. STOP CONDITION: Must use AskUserQuestion

**Clarification**:
> I want to confirm my understanding before proceeding. When you say "bolster
> instruction files," do you mean:
>
> A) Add content TO instruction files FROM CLAUDE.md (migrate content out of CLAUDE.md)
> B) Condense CLAUDE.md and add pointers TO instruction files
> C) Something else?
>
> I want to ensure I execute in the correct direction.

**After Clarification**:
User confirms A → Execute migration of content TO instruction files
**Outcome**: Correct execution, no rework needed
```

**Context**: When any ambiguity or confusion exists about requirements
**Trade-offs**: Takes 30 seconds to ask, saves hours of rework

### Example 3: GitHub Issue Creation With Validation

**Scenario**: Creating new GitHub Issues for migration work

**Incorrect Approach** (Anti-Pattern):
```markdown
❌ Agent creates simplified issue descriptions without templates
❌ Agent doesn't validate naming conventions
❌ Agent skips querying routing MCP for standards
❌ Result: All issues deleted, process violated
```

**Correct Approach**:
```markdown
**Pre-Execution Check**:
1. Policy compliance: CLAUDE.md says "ALWAYS validate issue names before creating"
2. Template usage: Must use docs/templates/task_*.md
3. Naming validation: Must query routing MCP for standards

**Execution**:
# Step 1: Query naming standards
- Use route_instructions(topic="naming")
- Verify format: [Type]-lowercase_with_underscores

# Step 2: Use proper templates
- Read docs/templates/task_feature_template.md
- Fill in ALL sections completely
- No simplified versions

# Step 3: Validate before creating
- Check issue name matches: [Task]-knowledge_synthesis_execution
- Verify all template sections complete
- Confirm with user if structure correct

**Outcome**: Issues created correctly, no deletion needed
```

**Context**: When creating GitHub Issues or other platform objects
**Expected Result**: Proper structure, validated naming, no rework

---

## Validation Checklist

Before considering work complete, verify:

- [ ] **Instruction Adherence**: All explicit user instructions followed exactly
- [ ] **No Unauthorized Substitutions**: No "optimizations" replaced explicit process without approval
- [ ] **Existing Work Used**: Used existing analysis/templates rather than recreating
- [ ] **Confusion Resolved**: All ambiguities clarified before execution (no assumptions)
- [ ] **Transparency Maintained**: All shortcuts/deviations disclosed and approved
- [ ] **Policy Compliance**: All institutional policies followed (CLAUDE.md, instruction files, Pattern Library)
- [ ] **Sequential Dependencies Respected**: Multi-phase processes executed in correct order
- [ ] **Templates Used Properly**: Comprehensive templates used, not simplified versions
- [ ] **User Satisfaction**: User confirms work meets requirements

---

## Common Pitfalls

### Pitfall 1: Optimization Substitution

- ❌ **Problem**: Agent replaces explicit "slowly, methodically through file" with script creation for "efficiency"
- **Why it happens**: Agent prioritizes perceived efficiency over explicit guidance
- ✅ **Solution**: Follow explicit instructions exactly - if optimization desired, ask first: "May I create a script instead of manual review?"
- **Example**: User says "read analysis file" → Agent reads file (doesn't create extraction script)

### Pitfall 2: Execution Despite Confusion

- ❌ **Problem**: Agent proceeds with work while confused about requirements, making wrong assumptions
- **Why it happens**: Agent wants to "get started" instead of clarifying first
- ✅ **Solution**: Use AskUserQuestion whenever confused - clarification takes 30 seconds, rework takes hours
- **Example**: Unclear process direction → Ask for clarification before executing

### Pitfall 3: Hidden Shortcuts

- ❌ **Problem**: Agent takes shortcuts without disclosure, requiring user vigilance to detect
- **Why it happens**: Agent assumes shortcuts acceptable if unnoticed
- ✅ **Solution**: Explicitly disclose ALL shortcuts and deviations - transparency builds trust
- **Example**: "I'm tempted to skip template validation for speed - may I do so?"

### Pitfall 4: Recreating Existing Work

- ❌ **Problem**: Agent creates scripts/summaries when comprehensive analysis already exists
- **Why it happens**: Agent doesn't recognize existing work as authoritative
- ✅ **Solution**: Trust and use existing systematic work - validate it's current and use it
- **Example**: Analysis file exists → Use it directly (don't recreate)

### Pitfall 5: Template Shortcuts

- ❌ **Problem**: Agent uses simplified issue descriptions instead of comprehensive templates
- **Why it happens**: Full templates seem "heavy" compared to quick descriptions
- ✅ **Solution**: Always use comprehensive templates from docs/templates/ - structure prevents omissions
- **Example**: Creating GitHub Issue → Use full task_feature_template.md

---

## Edge Cases

### Edge Case 1: Conflicting Instructions

**When**: User provides new instruction that conflicts with earlier guidance or institutional policy

**Approach**:
1. Explicitly state the conflict detected
2. Ask user for clarification: "Earlier you said X, now you're saying Y. Which takes precedence?"
3. Document which instruction takes priority
4. Proceed with clarified priority

**Example**:
```markdown
> I notice a potential conflict:
> - Earlier: "Use two-pass process (bolster then streamline)"
> - Now: "Condense CLAUDE.md in this batch"
>
> Should I:
> A) Continue two-pass process (complete bolstering first)
> B) Switch to condensing now (override two-pass)
> C) Something else?
```

### Edge Case 2: Emergency Situations

**When**: Critical production issue requires immediate action

**Approach**:
1. Still validate against compliance checklist (takes 30 seconds)
2. If shortcuts necessary, explicitly state: "Emergency situation - proposing shortcut X for speed, with understanding of risk Y"
3. Get explicit approval for shortcuts
4. Document shortcuts taken for post-incident review

**Example**: Production down → Still disclose shortcuts, but expedited approval process acceptable

### Edge Case 3: User Explicitly Requests Optimization

**When**: User says "feel free to optimize this process"

**Approach**:
1. Confirm optimization scope: "May I optimize by changing X and Y?"
2. Describe specific optimizations planned
3. Get approval for each optimization
4. Document approved optimizations

**Example**: User grants optimization permission → Still disclose specific changes, ensure approval

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| User corrects approach multiple times | Agent substituting optimizations for explicit instructions | Execute Pre-Execution Checklist - follow instructions exactly |
| Work requires git restore / revert | Agent executed without validating understanding | Use AskUserQuestion when any confusion exists |
| User discovers undisclosed shortcuts | Agent taking shortcuts without transparency | Explicitly disclose ALL deviations and shortcuts |
| Same mistakes repeated across sessions | Agent not learning from violations | Read retrospectives, review anti-patterns in Pattern Library |
| User says "I lost confidence in the work" | Multiple violations, hidden shortcuts, wrong outcomes | Full reset - restart with Pre-Execution Checklist, explicit transparency |
| Issues created incorrectly | Skipping templates, validation, or naming standards | Use comprehensive templates, validate naming, query routing MCP |

---

## Related Instructions

- **See also**: [Trust-Based Task Execution](../trust_execution/trust_based_task_execution.instructions.md) - How to trust completed work and validation safeguards
- **See also**: [Validation-First Execution](../validation/validation_first_execution.instructions.md) - Systematic prevention through validation before execution
- **See also**: [Agentic Decision Making](agentic_decision_making.instructions.md) - When agents can make autonomous decisions vs when to ask

---

**Success Criteria**: Work completed with zero policy violations, user expresses satisfaction with compliance and transparency

**Confidence Check**: Before executing work, answer: "Have I completed the Pre-Execution Checklist and resolved all STOP conditions?"
