---
pongogo_instruction_spec: "0.0.2"
title: "Instruction File Creation Standards"
description: "Standards for creating new instruction files with proper structure and metadata."
applies_to:
  - "**/*"
domains:
  - "documentation"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 0
  triggers:
    keywords:
      - instruction_file
      - create_instruction
      - instruction_template
      - YAML_frontmatter
      - evaluation_criteria
      - success_signals
      - failure_signals
      - prompt_engineering
      - instruction_standards
    nlp: "Creating instruction files with proper structure, evaluation criteria, and prompt engineering best practices"
evaluation:
  success_signals:
    - YAML frontmatter includes evaluation section with success/failure signals
    - Purpose and Philosophy statements are one sentence each
    - Quick Reference section provides 3-5 actionable patterns
    - Examples demonstrate exact structure (not just rules)
    - Step-by-step guidance uses numbered steps with expected outcomes
  failure_signals:
    - Missing evaluation criteria (no success/failure signals)
    - Abstract principles without concrete examples
    - Prose paragraphs instead of structured lists/steps
    - Vague terms without explicit definitions
    - Missing "When to Apply" scenarios
---


# Instruction File Creation Standards

**Purpose**: Define standards for creating instruction files that produce reliable agent behavior through clear structure, evaluation criteria, and prompt engineering best practices.

**Philosophy**: Instructions must be testable - every instruction file needs explicit success and failure signals that enable compliance verification without human judgment.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Creating new instruction files for any domain
- **Scenario 2**: Reviewing existing instructions for quality improvement
- **Scenario 3**: Agent needs guidance on what makes a good instruction file
- **Scenario 4**: Converting informal knowledge into structured instruction files
- **Scenario 5**: Evaluating instruction file quality against standards

---

## Quick Reference

**Essential Instruction File Components**:

**1. YAML Frontmatter Template**:
```yaml
---
title: "Human-Readable Title"
description: "One-sentence description of purpose"
applies_to:
  - "**/*.ts"  # Glob patterns for auto-discovery
domains:
  - "domain_name"
priority: "P0"  # P0=Critical, P1=Core, P2=Standard, P3=Optional
patterns:
  - "pattern_name"
related_instructions:
  - "../path/to/related.instructions.md"
evaluation:
  success_signals:
    - Observable behavior when instruction is followed correctly
    - Another measurable outcome indicating success
  failure_signals:
    - Observable behavior when instruction is NOT followed
    - Anti-pattern that indicates non-compliance
routing:
  priority: 1
  triggers:
    keywords:
      - snake_case_keywords
    nlp: "Natural language description of when this applies"
---
```

**2. Document Structure Template**:
```markdown
# Title

**Purpose**: One sentence describing what this instruction achieves.

**Philosophy**: One sentence describing the underlying principle.

---

## When to Apply
- Scenario 1: [specific trigger condition]
- Scenario 2: [another trigger condition]

---

## Quick Reference
[3-5 most common patterns with code examples]

---

## Core Principles
- Principle 1 (no more than 5)

## Step-by-Step Guidance
### 1. First Step
[Action with expected outcome]

## Examples
### Example 1: [Scenario Name]
[Complete working example]

## Validation Checklist
- [ ] Checkable item

## Common Pitfalls
### Pitfall 1: [Name]
- Problem, Why it happens, Solution
```

**3. Evaluation Criteria Pattern**:
```yaml
evaluation:
  success_signals:
    - [What you observe when instruction is followed]
    - [Measurable outcome, not subjective assessment]
    - [Specific artifact or behavior, not vague quality]
  failure_signals:
    - [What you observe when instruction is NOT followed]
    - [Anti-pattern that indicates non-compliance]
    - [Concrete failure mode, not absence of success]
```

**4. Example Quality Standard**:
```markdown
### Example 1: [Descriptive Scenario Name]

**Context**: [When/why this example applies]

**Scenario**: [Specific situation being demonstrated]

[Code block or structured content showing exact format]

**Expected Result**: [What happens when example is applied]
```

**5. Keywords Convention**:
```yaml
keywords:
  - snake_case_only        # Correct: enables n-gram matching
  - multi_word_concept     # Correct: "multi word concept" matches
  - single-word            # WRONG: hyphens break matching
  - "two words"            # WRONG: spaces break matching
```

---

## Core Principles

- **Evaluation-First Design**: Every instruction must have explicit success and failure signals before writing content
- **Colleague Test Clarity**: Instructions must be executable by someone with no prior context
- **Show Don't Tell**: Examples demonstrate exact structure, not abstract rules
- **Machine-Readable Structure**: Use numbered steps, checklists, and code blocks (not prose paragraphs)
- **Progressive Disclosure**: Essential patterns in Quick Reference, detail in Step-by-Step

---

## Step-by-Step Guidance

### 1. Define Evaluation Criteria First

Before writing any content, define what success and failure look like.

**Action**: Write `evaluation` section in YAML frontmatter with 5 success signals and 5 failure signals

**Success Signal Criteria**:
- Observable (can see it happened)
- Specific (not vague like "good quality")
- Measurable (can count or verify)
- Actionable (tells you what to check)

**Failure Signal Criteria**:
- Concrete anti-patterns (not just "didn't follow instruction")
- Common mistakes (things that actually happen)
- Detectable (can identify when they occur)

**Expected outcome**: Clear criteria that enable automated compliance checking

### 2. Write Purpose and Philosophy Statements

**Action**: Create exactly one sentence for each

**Purpose Format**: "Define/Establish/Ensure [what] for [outcome]"
**Philosophy Format**: "[Core principle] - [why it matters]"

**Examples**:
- Purpose: "Ensure all validation produces deterministic results with 100% pass rate requirement."
- Philosophy: "Agents require binary pass/fail signals, not probabilistic thresholds."

**Expected outcome**: Reader understands intent in two sentences

### 3. Define "When to Apply" Scenarios

**Action**: List 3-5 specific scenarios where this instruction should trigger

**Scenario Format**: "**Scenario N**: [Specific condition or trigger]"

**Guidelines**:
- Be specific (not "when writing code")
- Include both common and edge cases
- Match routing keywords to scenarios

**Expected outcome**: Agent knows exactly when to apply this instruction

### 4. Create Quick Reference Section

**Action**: Extract 3-5 most common patterns as minimal, runnable examples

**Guidelines**:
- Each pattern: 5-15 lines of code maximum
- Include language tags on code blocks
- No explanatory prose (save for Step-by-Step)
- Number each pattern for reference

**Expected outcome**: Agent finds common patterns in <5 seconds

### 5. Write Step-by-Step Guidance with Expected Outcomes

**Action**: Create numbered steps, each with explicit expected outcome

**Step Format**:
```markdown
### N. Step Title

[Action description in imperative mood]

- Specific action 1
- Specific action 2

**Expected outcome**: [What should exist after this step]
```

**Guidelines**:
- Use imperative mood ("Create file" not "You should create")
- Include expected outcome for every step
- Keep steps atomic (one action per step)

**Expected outcome**: Agent can execute step-by-step without interpretation

### 6. Provide Concrete Examples

**Action**: Include 2-3 complete, working examples

**Example Requirements**:
- Show exact format (not description of format)
- Include context and scenario
- State expected result
- Cover common case + edge case

**Expected outcome**: Agent can copy/adapt examples directly

### 7. Add Validation Checklist

**Action**: Create machine-readable checklist with markdown checkboxes

**Checklist Format**:
```markdown
## Validation Checklist

- [ ] Evaluation criteria defined in frontmatter
- [ ] Purpose is one sentence
- [ ] Philosophy is one sentence
- [ ] Quick Reference has 3-5 patterns
- [ ] Examples show exact structure
- [ ] All steps have expected outcomes
```

**Expected outcome**: Agent can verify completion programmatically

### 8. Document Common Pitfalls

**Action**: List 3-5 common mistakes with problem, cause, and solution

**Pitfall Format**:
```markdown
### Pitfall N: [Name]

- **Problem**: [What goes wrong]
- **Why it happens**: [Root cause]
- **Solution**: [How to fix or prevent]
```

**Expected outcome**: Agent avoids documented mistakes

### 9. Add Enforcement Frontmatter (Procedural Instructions Only)

**Action**: For instructions with numbered steps, checklists, or multi-phase processes, add an `enforcement:` block to the YAML frontmatter. This enables Pongogo's preceptor (v0.2.0) to automatically block mutating tools until compliance requirements are met.

**Enforcement Template**:
```yaml
enforcement:
  scope: session              # session or action
  blocked_tools:
    - mutating                # Tool categories: mutating, reading, executing
  blocked_until:
    - action_type: read_instruction     # Must read this instruction file
```

**Supported `action_type` values**:

| action_type | Purpose | Required fields |
|---|---|---|
| `read_instruction` | Agent must read this instruction file | None (implicit) |
| `read_file` | Agent must read a specific file | `file: "path/to/file"` |
| `call_mcp_tool` | Agent must call a specific MCP tool | `tool_name: "tool_name"`, optional `required_args: {}` |
| `process_checklist` | Agent must process a checklist | None |
| `approval_required` | User approval required | None |

**`call_mcp_tool` Example** (when instruction requires an MCP tool call):
```yaml
enforcement:
  scope: session
  blocked_tools:
    - mutating
  blocked_until:
    - action_type: call_mcp_tool
      tool_name: "log_user_guidance"
      required_args:           # Optional: args the tool call must include
        guidance_type: "explicit"
```

**When to add enforcement**:
- Instruction has numbered steps that MUST be followed in order
- Skipping steps leads to measurable failure (documented incidents, RCAs)
- Multi-step processes where agents tend to execute from memory
- Instruction requires a specific MCP tool call as its core action

**When NOT to add enforcement**:
- Reference/advisory instructions (architecture principles, naming conventions)
- Behavioral instructions (collaboration preferences, communication style)
- Informational instructions without mandatory workflow

**Expected outcome**: Preceptor automatically enforces compliance before agents can take mutating actions

---

## Examples

### Example 1: Minimal Instruction File

**Context**: Creating a simple instruction file for a single concept

**Scenario**: New instruction for commit message formatting

```yaml
---
title: "Commit Message Format"
description: "Context-rich commit messages with model attribution"
applies_to:
  - "**/*"
domains:
  - "software_engineering"
priority: "P1"
patterns:
  - "context_rich_commits"
evaluation:
  success_signals:
    - Summary line 50-72 chars in imperative mood
    - What Changed and Why sections present
    - Model attribution footer included
  failure_signals:
    - Vague summary like "update files"
    - Missing Why section
    - No model attribution
routing:
  priority: 1
  triggers:
    keywords:
      - commit_message
      - git_commit
    nlp: "Creating commit messages with context and attribution"
---

# Commit Message Format

**Purpose**: Create commit messages that provide context for future archaeology.

**Philosophy**: Commit messages are for future readers - document why, not just what.

---

## When to Apply

- **Scenario 1**: Creating any git commit
- **Scenario 2**: Reviewing commit message quality

---

## Quick Reference

**1. Standard Format**:
```
Brief summary (50-72 chars)

## What Changed
- Change 1
- Change 2

## Why
- Rationale

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Core Principles

- Imperative mood in summary ("Add" not "Added")
- Why section explains rationale, not just changes
- Model attribution for AI-assisted commits

## Validation Checklist

- [ ] Summary 50-72 characters
- [ ] Imperative mood used
- [ ] What Changed section present
- [ ] Why section present
- [ ] Model attribution included
```

**Expected Result**: Complete, minimal instruction file with all required components

### Example 2: Evaluation Criteria for Complex Process

**Context**: Defining success/failure signals for multi-step process

**Scenario**: Work logging instruction with observable compliance indicators

```yaml
evaluation:
  success_signals:
    - Wiki repository validated before adding entry
    - Entry at TOP of date section (reverse chronological)
    - Bidirectional links created (wiki <-> GitHub)
    - Two-level learning captured (content + process)
    - Changes committed and pushed immediately
  failure_signals:
    - Skipping wiki validation before entry
    - Entry appended to bottom (chronological order)
    - One-way linking (wiki -> GitHub only)
    - Missing sidebar update on first entry of day
    - Forgetting to push after commit
```

**Expected Result**: Any agent can verify compliance by checking these specific signals

### Example 3: Quick Reference with Decision Criteria

**Context**: Instruction that requires judgment, not code patterns

**Scenario**: When to escalate vs handle autonomously

```markdown
## Quick Reference

**Escalation Decision Criteria**:

| Situation | Action |
|-----------|--------|
| User explicitly requested | Always escalate |
| Destructive operation | Escalate with explanation |
| Uncertainty about intent | Ask clarifying question |
| Within established pattern | Handle autonomously |
| First occurrence of scenario | Document and ask |

**Key Questions**:
1. Did user explicitly request this action?
2. Is this operation reversible?
3. Does established pattern exist?
4. Am I uncertain about intent?
```

**Expected Result**: Decision-heavy instructions provide criteria, not code

---

## Validation Checklist

Before marking instruction file complete:

### Structure Validation
- [ ] YAML frontmatter complete with all fields
- [ ] `evaluation` section with success_signals and failure_signals
- [ ] Purpose statement is one sentence
- [ ] Philosophy statement is one sentence
- [ ] "When to Apply" has 3-5 scenarios
- [ ] Quick Reference has 3-5 patterns or decision criteria
- [ ] Core Principles has 3-5 items
- [ ] Step-by-Step has numbered steps with expected outcomes
- [ ] 2-3 complete examples included
- [ ] Validation Checklist uses markdown checkboxes
- [ ] Common Pitfalls documented

### Quality Validation
- [ ] Success signals are observable and measurable
- [ ] Failure signals are concrete anti-patterns
- [ ] Examples show exact structure (not descriptions)
- [ ] No prose paragraphs in Step-by-Step (use lists)
- [ ] Keywords use snake_case (no spaces or hyphens)
- [ ] Imperative mood throughout ("Create" not "You should create")

### Routing Validation
- [ ] `applies_to` patterns match intended files
- [ ] Keywords are specific to this instruction
- [ ] NLP description matches When to Apply scenarios

### Enforcement Validation (Procedural Instructions Only)
- [ ] `enforcement:` block added if instruction has numbered steps or checklists
- [ ] `scope` is `session` (default) or `action`
- [ ] `blocked_tools` categories are appropriate (`mutating`, `reading`, `executing`)
- [ ] `blocked_until` action_type matches requirement (`read_instruction`, `call_mcp_tool`, etc.)
- [ ] If `call_mcp_tool`: `tool_name` field is present and correct
- [ ] If NOT procedural: enforcement block is omitted (not every instruction needs one)

---

## Common Pitfalls

### Pitfall 1: Missing Evaluation Criteria

- **Problem**: Instruction has no success/failure signals, making compliance unverifiable
- **Why it happens**: Writing content first, evaluation as afterthought
- **Solution**: Define evaluation section BEFORE writing any other content

### Pitfall 2: Abstract Examples

- **Problem**: Examples describe what to do instead of showing exact format
- **Why it happens**: Assuming reader will figure out specifics
- **Solution**: Show complete, copy-pasteable examples with actual content

### Pitfall 3: Prose Instead of Structure

- **Problem**: Step-by-step guidance written as paragraphs
- **Why it happens**: Writing for human reading, not agent parsing
- **Solution**: Use numbered steps, bullet lists, and expected outcomes

### Pitfall 4: Vague Success Signals

- **Problem**: Success signals like "good quality" or "properly formatted"
- **Why it happens**: Not thinking about how to verify compliance
- **Solution**: Make signals observable ("file exists", "line count > 0", "contains X")

### Pitfall 5: Keyword Format Errors

- **Problem**: Keywords use spaces or hyphens, breaking n-gram matching
- **Why it happens**: Not knowing snake_case convention
- **Solution**: Always use snake_case: `issue_closure` not `issue closure` or `issue-closure`

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Instruction not triggering | Keywords don't match user input | Add more keyword variants, check snake_case |
| Agent doesn't follow instruction | No clear step-by-step guidance | Add numbered steps with expected outcomes |
| Compliance unclear | Missing evaluation criteria | Add success/failure signals to frontmatter |
| Examples don't help | Examples describe instead of show | Provide complete, copy-pasteable examples |
| Too long to scan | Missing Quick Reference | Add 3-5 most common patterns at top |

---

## Related Instructions

- **See also**: [agent_compliance_framework.instructions.md](../agentic_workflows/agent_compliance_framework.instructions.md) - How agents should comply with instructions
- **See also**: [_pongogo_collaboration.instructions.md](../_pongogo_core/_pongogo_collaboration.instructions.md) - Communication style preferences

---

**Success Criteria**: Every instruction file has explicit evaluation criteria, clear structure, and concrete examples that enable reliable agent compliance without human judgment.

**Confidence Check**: Can you verify compliance with this instruction by checking specific signals? Can an agent copy examples directly? Is every step actionable with expected outcome?
