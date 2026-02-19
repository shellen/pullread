---
pongogo_instruction_spec: "0.0.2"
title: "Instruction File Compliance Framework"
description: "Ensures agents READ routed instructions rather than executing from memory, preventing the 'Instruction Execution from Memory' anti-pattern."
applies_to:
  - "**/*.md"
  - "**/*.instructions.md"
domains:
  - "compliance"
  - "agentic_workflows"
priority: "P0"
pongogo_version: "2026-02-13"
source: "Original"

id: documentation_instruction_file_compliance
enforcement:
  scope: session
  blocked_tools:
    - mutating
  blocked_until:
    - action_type: read_instruction
routing:
  priority: 1
  description: "Compliance framework ensuring agents read instruction files before executing procedural actions"
  triggers:
    keywords:
      - instruction_compliance
      - routing_compliance
      - read_instruction
      - follow_checklist
      - procedural_instruction
      - mandatory_read
      - execute_from_memory
      - mental_checklist
      - compliance_gate
      - read_before_execute
      - skipped_steps
      - checklist_verification
    nlp: "Ensuring agents read routed instructions rather than executing from memory to prevent step skipping and compliance failures"
evaluation:
  success_signals:
    - Agent calls Read tool on instruction file before executing procedural actions
    - Completion claims cite step numbers from the actual instruction file
    - Agent verifies each mandatory step against the file before claiming completion
    - Compliance gate questions answered before procedural execution
  failure_signals:
    - Agent executes procedural steps from memory without reading instruction file
    - Completion summary uses generic descriptions instead of step-number citations
    - Routing surfaces instruction but agent acknowledges without reading
    - Agent claims "I know what the checklist says" instead of reading it
---


# Instruction File Compliance Framework

**Purpose**: Ensure routed instructions are READ, not executed from memory, preventing the "Instruction Execution from Memory" anti-pattern that defeats the routing system.

**Philosophy**: Routing discovery does not equal instruction compliance. Surfacing an instruction is only half the solution. Enforcement between "instruction surfaced" and "instruction followed" is the other half.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Routing surfaces an instruction file with procedural content (checklists, multi-step processes)
- **Scenario 2**: About to execute any multi-step workflow (issue closure, learning loop, RCA, etc.)
- **Scenario 3**: Claiming completion of a procedural task ("learning loop conducted", "checklist complete")
- **Scenario 4**: Status transition that requires checklist verification
- **Scenario 5**: Any situation where you "know" what an instruction file says without reading it

---

## COMPLIANCE GATE (BLOCKING - NOT ADVISORY)

**BEFORE EXECUTING ANY PROCEDURAL INSTRUCTION, ANSWER THESE QUESTIONS**:

1. **Have I READ (not recalled) this instruction file?**
   - YES: Proceed
   - NO: **STOP. Read the instruction file NOW.**

2. **Am I about to execute from memory?**
   - YES: **STOP. This is the "Instruction Execution from Memory" anti-pattern**
   - NO: Proceed

3. **Can I cite step numbers from the file?**
   - YES: You have read it. Proceed.
   - NO: You have not read it. **STOP and read it.**

---

## Quick Reference

**Key Decision Criteria**:

- **Procedural Instruction**: Has numbered steps, checklist, or multi-phase process. MUST READ BEFORE EXECUTING
- **Reference Instruction**: API patterns, code snippets, configuration. Can reference as needed
- **Routing Surfaced**: Routing recommends an instruction. READ IT, don't acknowledge and proceed

**Compliance Self-Check** (ask before claiming completion):
```
1. Did I READ the instruction file? (not recall from memory)
2. Can I cite step numbers for what I completed?
3. Did I verify completion against the file's checklist?
```

**Anti-Pattern Detection**:
```
If you find yourself thinking:
  "I know what the checklist says..."
  "The learning loop is: review, extract, capture..."
  "Issue closure requires approval and then..."

STOP. This is "mental checklist execution." Read the actual file.
```

---

## Core Principles

- **Routing Discovery is not Compliance**: Surfacing an instruction does not mean it will be followed
- **READ Before Execute**: Never assume knowledge of procedural instruction content
- **Cite Step Numbers**: Completion claims must reference specific steps from the file
- **Compliance Gates are not Reminders**: Gates enforce behavior; reminders are ignored
- **Prevention over Detection**: Catch compliance gaps before user detection

---

## Enforcement Mechanism

**HARD REQUIREMENT**: The compliance gate above is **BLOCKING**, not advisory.

**Mandatory Read Tool Call**:
- Before ANY procedural action (closure, learning loop, RCA, etc.), you MUST call the `Read` tool on the relevant instruction file
- If the instruction file references additional documents, you MUST Read those too
- The Read tool call creates an **audit trail** in your transcript

**Compliance Evidence**:
- If user asks "did you follow the checklist?" your transcript MUST contain Read tool calls for the checklist
- If Read tool call is NOT in transcript, compliance failed
- "I know what the checklist says" is NOT evidence. The Read tool call IS evidence.

**Step Citation Requirement**:
- Completion comments MUST cite step numbers from the actual file
- Format: "Step 1: [action] done", "Step 2: [action] done", etc.
- Generic summaries without step numbers indicate memory-based execution

---

## Step-by-Step Guidance

### 1. Recognize Procedural Instructions

**Action**: Identify instruction files that require full reading before execution.

**Procedural Instruction Indicators**:
- Contains numbered steps (Step 1, Step 2, Step 3...)
- Has checklist format (checkbox items)
- Describes multi-phase process (Phase 1, Phase 2, Phase 3)
- References "mandatory" steps or requirements
- Line count > 100 (substantial procedural content)

**Expected outcome**: You can distinguish procedural instructions from reference instructions.

### 2. Execute Compliance Gate

**Action**: Before executing any procedural instruction, pass the compliance gate.

**Compliance Gate Questions**:
1. Have I READ (not recalled) this instruction file?
2. Am I about to execute from memory?
3. Can I cite step numbers from the file?

**If ANY answer is wrong**:
- STOP execution
- Read the full instruction file
- Re-attempt compliance gate

### 3. Execute with File Reference

**Action**: Keep the instruction file content visible during execution.

**Process**:
1. Read the instruction file fully
2. Note total steps/phases
3. Execute step by step, checking each against the file
4. Mark completion as you go (not at end)

**DO NOT**:
- Execute from memory after reading once
- Skip steps because "I remember what to do"
- Batch-mark completions at the end

**Success indicator**: You can cite the step number you are currently executing.

### 4. Verify Completion Against File

**Action**: After execution, verify against the instruction file's checklist.

**Verification Process**:
1. Re-read the instruction file's validation checklist (if present)
2. Confirm each mandatory step was executed (not just "covered")
3. Note any steps that were implicit vs explicit
4. If gaps found: execute missing steps before claiming completion

**Expected outcome**: You can provide evidence for each mandatory step.

### 5. Cite Step Numbers in Completion Claims

**Action**: When claiming completion, reference specific steps from the file.

**Good Completion Claim**:
```
Learning loop complete:
- Step 1 (Review): Completed, reviewed deliverables
- Step 2 (Extract): Completed, identified 2 patterns
- Step 3 (Capture): Completed, PI created
- Step 4 (Document): Completed, decision recorded
- Step 5 (Create artifact): Completed, work log entry added
- Step 6 (Institutionalize): Completed, Pattern Library updated

Evidence: Can cite step numbers from learning_loop_execution.instructions.md
```

**Bad Completion Claim**:
```
Learning loop complete - reviewed work, extracted patterns, updated knowledge.
```

---

## Declarative Enforcement Engine (Preceptor v0.2.0)

The compliance framework is backed by Pongogo's declarative enforcement engine (the "preceptor"), which automatically blocks mutating tools until compliance requirements are met.

**Enforcement action types**:

| action_type | What it enforces | How it is fulfilled |
|---|---|---|
| `read_instruction` | Agent must READ the instruction file | Agent calls `Read` tool on the instruction file |
| `read_file` | Agent must read a specific file | Agent calls `Read` on the specified file path |
| `call_mcp_tool` | Agent must call a specific MCP tool | Agent calls the named MCP tool |
| `process_checklist` | Agent must process a checklist | Agent works through checklist items |
| `approval_required` | User approval required | User approves the action |

**`call_mcp_tool` enforcement** (new in Preceptor v0.2.0):

Some procedural instructions require calling an MCP tool as the compliance-critical action. For example, a user guidance capture instruction might require calling `log_user_guidance`. Reading the instruction alone is insufficient.

```yaml
# Example: enforcement that requires an MCP tool call
enforcement:
  scope: session
  blocked_tools:
    - mutating
  blocked_until:
    - action_type: call_mcp_tool
      tool_name: "log_user_guidance"
```

The preceptor validates both tool name matching and optional required arguments. This extends compliance beyond "read before execute" to "act before proceed."

---

## Examples

### Example 1: Compliant Procedural Execution

**Context**: Closing an issue after completing work.

**Compliant Execution**:
```
Pre-Closure Compliance Check:
1. Have I READ issue_closure.instructions.md? YES - Read full file
2. Am I executing from memory? NO - Following file directly
3. Can I cite step numbers? YES - Currently on Step 5

Execution Log:
Step 1: Deliverables verified
Step 2: Documentation updated
Step 3: Checkboxes updated (real-time)
Step 4: Acceptance criteria met
Step 5: Learning loop conducted
Step 6: Cross-issue impacts checked
Step 7: Completion comment posted
Step 8: Status set to Ready for Review
```

**Expected Result**: All steps executed, user approval obtained, zero compliance gaps.

### Example 2: Detecting Mental Checklist Execution

**Context**: Agent about to execute a learning loop.

**Non-Compliant (Mental Checklist)**:
```
I'll conduct the learning loop now:
- Review what was accomplished
- Extract patterns
- Update knowledge systems
```

**Problem**: No file reference, no step numbers, executing from memory.

**Compliant (File-Based)**:
```
Let me read learning_loop_execution.instructions.md first.
[Reads file]

Now executing learning loop per instruction file:

Step 1 (Review): What was accomplished?
- Created compliance instruction file
- Updated Pattern Library

Step 6 (Institutionalize): What knowledge systems updated?
- Pattern Library: Added 3 patterns
- Strategic Insights: Added 1 insight
```

---

## Validation Checklist

**Before claiming procedural instruction completion**:

- [ ] Compliance gate passed (3 questions answered YES)
- [ ] Instruction file read in full (not recalled from memory)
- [ ] Step numbers citable for completed work
- [ ] Each mandatory step verified against file
- [ ] No implicit execution (explicit verification for each step)
- [ ] Completion evidence tied to specific steps

---

## Common Pitfalls

### Pitfall 1: Instruction Execution from Memory

- **Problem**: Agent acknowledges instruction file exists, executes from memory, misses steps
- **Why it happens**: Agent assumes it "knows" what the checklist requires
- **Solution**: Always read file before execution, cite step numbers

### Pitfall 2: Routing Discovery Theater

- **Problem**: Routing surfaces correct instruction, agent acknowledges but does not read
- **Why it happens**: Routing designed for discovery, not compliance verification
- **Solution**: Treat routing recommendations as "READ NOW" commands, not "FYI" notices

### Pitfall 3: Mental Checklist with False Precision

- **Problem**: Agent creates detailed completion summary that hides missed steps
- **Why it happens**: Memory-based execution feels systematic but is not verified
- **Solution**: Require step-number citations, verify against actual file

### Pitfall 4: Batch Compliance Verification

- **Problem**: Verifying compliance at end instead of during execution
- **Why it happens**: Efficiency bias, belief that "I'll check at the end"
- **Solution**: Real-time step verification, mark as you go

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| User asks "did you follow checklist?" | Compliance gap detected | Re-read file, execute missing steps |
| Cannot cite step numbers | Memory-based execution | Read file again, note step numbers |
| Missed mandatory step | Skipped compliance gate | Execute compliance gate before next procedure |
| False completion claim | Mental checklist execution | Verify each step against actual file |
| User catches gaps repeatedly | Systemic compliance failure | Review this instruction, add to workflow |

---

## Integration with Routing System

**Critical Insight**: The routing system's value depends on this compliance framework.

**Without Compliance**:
- Routing surfaces correct instructions. Agent acknowledges. Executes from memory. Steps missed.
- Result: Routing investment produces no outcome (discovery theater)

**With Compliance**:
- Routing surfaces correct instructions. Agent reads file. Executes from file. Steps completed.
- Result: Routing investment produces correct behavior (discovery to compliance to outcome)

**Strategic Priority**: This compliance framework is P0 because it protects the routing system investment.

---

**Success Criteria**: Agents can execute procedural instructions with zero user-detected compliance gaps by reading files before execution and citing step numbers in completion claims.

**Confidence Check**: "Can I cite the step number I'm currently executing from the instruction file?" If YES, compliant. If NO, stop and read the file.
