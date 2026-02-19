---
pongogo_instruction_spec: "0.0.2"
title: "Token Usage and Context Management"
description: "Guidance for managing token usage, context windows, and conversation efficiency."
applies_to:
  - "**/*"
domains:
  - "development"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - token_usage
      - context_window
      - context_management
      - token_cost
      - /compact
      - session_restart
      - context_preservation
      - context_exhaustion
      - 200K_token
      - context_window_limit
      - proactive_compacting
      - session_state_transfer
      - work_log_offload
      - strategic_preservation
      - completeness_over_cost
    nlp: "Managing token usage and context window to preserve operational capacity rather than minimizing cost"
evaluation:
  success_signals:
    - Completeness never sacrificed for token cost
    - Context window monitored at thresholds (150K+)
    - Strategic compacting preserves high-value recent context
    - Work log used for context offload
    - Quality-driven verbosity decisions
  failure_signals:
    - Content truncated to save token costs
    - Context window exhaustion mid-session
    - Premature compacting (before 100K tokens)
    - "Arbitrary context removal (oldest N%)"
    - Ignoring context window entirely
---


# Token Usage and Context Window Management

**Purpose**: Establish principles for token usage optimization focusing on context window preservation (operational concern) rather than cost minimization (non-concern).

**Philosophy**: Token costs are negligible expense. Context window exhaustion is operational failure. Optimize for preserving context window capacity, not reducing token spend.

**Core Problem Solved**: "When should I worry about token usage, and when should I ignore it?"

---

## Quick Reference

### The Two Token Concerns

**Token Cost** (Expense):
- **Concern Level**: ZERO - Not something we worry about
- **Why**: Token costs are negligible in typical operating budgets
- **Action**: Never optimize for cost reduction, never truncate for cost savings
- **Example**: Don't summarize comprehensive RCA to save tokens on API calls

**Context Window** (Operational Capacity):
- **Concern Level**: HIGH - Critical operational concern
- **Why**: Losing context mid-session = operational failure, loss of state, broken workflows
- **Action**: Monitor context window usage, manage proactively to preserve continuity
- **Example**: Compact conversation history when approaching window limit to preserve recent critical context

### Decision Rule

```
Question: "Should I reduce token usage here?"

Check WHY:
├─ To save money? → NO, ignore cost
├─ To preserve context window? → YES, manage proactively
└─ To improve quality? → Evaluate trade-offs (completeness vs brevity)
```

---

## When to Apply

Apply this instruction when:

- Creating comprehensive documentation (RCAs, retrospectives, instruction files)
- Deciding between verbose vs concise content
- Approaching context window limits during long sessions
- Evaluating whether to summarize or preserve full content
- Making trade-offs between completeness and token efficiency

---

## Core Principles

### Principle 1: Completeness Over Cost Efficiency

**Principle**: Never sacrifice completeness, quality, or depth to reduce token costs.

**Why**: Token costs are trivial (<$0.01 per 1000 tokens). Incomplete documentation creates knowledge gaps costing hours of rework. Rework time >> token cost by 1000x+.

**Application**:
- Create comprehensive RCAs (10,000+ tokens if needed)
- Write detailed instruction files with full examples
- Include all evidence, not summaries, in retrospectives
- Preserve full context in learning artifacts
- Never truncate templates to save tokens

**Example**:
- ❌ **Cost-optimized**: "RCA should be brief to save tokens"
- ✅ **Quality-optimized**: "RCA should be comprehensive (10K+ tokens) to capture all learnings"

**Cost Impact**: Comprehensive RCA = ~10,000 tokens = ~$0.03 at $3/1M tokens
**Rework Cost**: Missing root cause = 2 hours rework = $200+ equivalent time

**Trade-off**: $0.03 token cost vs $200 rework cost → Optimize for completeness

---

### Principle 2: Context Window as Operational Constraint

**Principle**: Context window exhaustion is operational failure. Monitor and manage proactively.

**Why**: Running out of context window mid-session:
- Loses conversation state
- Breaks workflow continuity
- Requires re-establishing context (time expensive)
- May lose critical recent decisions/work

**Application**:
- Monitor token usage during long sessions
- Use `/compact` command proactively when approaching limits
- Preserve recent critical context (last 20-30 exchanges)
- Archive older context strategically (work logs, decision summaries)
- Restart sessions when context window critically full

**Thresholds** (for 200K token window):
- **Green** (0-100K tokens): Normal operation, no concern
- **Yellow** (100K-150K tokens): Monitor, consider strategic compacting
- **Orange** (150K-180K tokens): Proactive compacting, prioritize recent context
- **Red** (180K-200K tokens): Critical - compact immediately or restart session

**Example**:
- Session at 175K tokens, creating comprehensive RCA
- **Action**: Complete RCA fully (don't truncate), then `/compact` to preserve recent work
- **Rationale**: Incomplete RCA wastes RCA work; compacting preserves both

---

### Principle 3: Quality-Driven Verbosity Decisions

**Principle**: When choosing verbosity level, optimize for quality and clarity, not token count.

**Why**: Clear, comprehensive documentation prevents misunderstanding, reduces rework, enables correct agent decisions.

**Application**:
- Instruction files: Include full examples, not just brief descriptions
- RCAs: Document complete failure chains, not just summaries
- Templates: Provide comprehensive guidance, not minimal skeletons
- Retrospectives: Capture all evidence, not cherry-picked highlights

**Trade-off Framework**:
1. **First priority**: Quality and completeness
2. **Second priority**: Clarity and usability
3. **Third priority**: Brevity (only when quality/clarity unaffected)
4. **Never priority**: Token cost reduction

**Example Decisions**:
- ❌ "Shorten RCA template to 2000 tokens to save costs"
- ✅ "RCA template is 15,000 tokens because comprehensive guidance prevents incomplete RCAs"
- ❌ "Summarize retrospective to 1000 tokens"
- ✅ "Retrospective is 8000 tokens because all evidence must be preserved"

---

### Principle 4: Strategic Context Preservation

**Principle**: When context window management required, preserve strategically, not arbitrarily.

**Why**: Not all context has equal value. Recent decisions, current work, and active tasks more valuable than early session exploratory discussions.

**Application**:

**Preserve (High Value)**:
- Recent decisions (last 10-20 exchanges)
- Active work in progress (current task context)
- Unresolved questions or blockers
- Critical reference material for current work

**Compact (Lower Value)**:
- Completed tasks (summarize outcomes)
- Exploratory discussions (preserve conclusions only)
- Resolved questions (preserve answers, not full discussion)
- Historical context (summarize, don't remove)

**Never Remove**:
- Current session's key decisions
- Active task requirements
- Unfinished work state
- Critical instructions or constraints

**Example**:
- Session at 180K tokens, working on RCA
- **Compact**: Early session exploration of related issues (preserve findings, compact discussion)
- **Preserve**: RCA creation process, recent meta-system discussion, current task state
- **Result**: Retain critical context, clear space for RCA completion

---

## Context Window Management Tactics

### Tactic 1: Proactive Compacting

**When**: At 150K tokens (before critical threshold)

**How**: Use `/compact` command to summarize older context while preserving recent critical exchanges

**Preserve**:
- Last 20-30 exchanges
- Current work in progress
- Active decisions and rationale
- Unresolved questions

**Compact**:
- Completed tasks → outcome summaries
- Exploratory discussions → key findings only
- Historical context → brief summaries

---

### Tactic 2: Session Restart with State Transfer

**When**: At 180K+ tokens, or when compacting insufficient

**How**:
1. Summarize current session state (decisions, work in progress, next steps)
2. Save summary to work log or temporary file
3. Start new session
4. Begin with state summary to re-establish context

**State Summary Contents**:
- Current task and status
- Key decisions made this session
- Work in progress (what's partially done)
- Next steps (what to do next)
- Critical context (constraints, requirements)

---

### Tactic 3: Work Log as Context Offload

**When**: Throughout session, especially for completed tasks

**How**:
1. Complete task
2. Create work log entry capturing outcome
3. Reference work log in future context instead of preserving full discussion
4. Allows compacting task discussion while preserving outcome

**Benefits**:
- Persistent context beyond session
- Enables aggressive compacting
- Provides archaeology trail
- Reduces context window pressure

---

## Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: Cost-Driven Truncation

**Error**: Reducing content quality or completeness to save token costs.

**Example**:
- ❌ "Make RCA template brief (2000 tokens) to reduce API costs"
- ❌ "Summarize retrospective evidence to save tokens"
- ❌ "Remove examples from instruction files for efficiency"

**Why Wrong**: Token costs negligible, quality/completeness costs enormous (hours of rework).

**Correct Approach**: Optimize for quality, ignore token cost entirely.

---

### Anti-Pattern 2: Premature Compacting

**Error**: Compacting context before reaching yellow threshold (100K tokens).

**Example**:
- ❌ Compacting at 50K tokens "to be safe"
- ❌ Removing context proactively when plenty of window remains

**Why Wrong**: Premature compacting loses valuable context unnecessarily, may need it later in session.

**Correct Approach**: Monitor, compact only when approaching thresholds (150K+ for 200K window).

---

### Anti-Pattern 3: Arbitrary Context Removal

**Error**: Removing context arbitrarily without strategic value assessment.

**Example**:
- ❌ Removing oldest 50% of conversation mechanically
- ❌ Deleting all exchanges before certain point

**Why Wrong**: May remove critical context (decisions, constraints, requirements) that's needed for current work.

**Correct Approach**: Strategic preservation (keep high-value recent context, compact low-value older context).

---

### Anti-Pattern 4: Ignoring Context Window Entirely

**Error**: Not monitoring token usage, running into window limit unexpectedly.

**Example**:
- ❌ Creating 50K token RCA at 175K token usage without checking
- ❌ No awareness of context window status

**Why Wrong**: Hitting window limit mid-work = operational failure, lost state.

**Correct Approach**: Monitor token usage, especially during long sessions or large artifact creation.

---

## Monitoring and Thresholds

### Token Window Monitoring

**Claude Code provides token usage in responses**: Watch for token counts in responses
- **Format**: `Token usage: X/200000; Y remaining`
- **Frequency**: Every response includes usage
- **Action Triggers**: See thresholds in Principle 2

### Session Length Indicators

**Long sessions increase context usage**:
- **Short sessions** (< 20 exchanges): Rarely concern
- **Medium sessions** (20-50 exchanges): Monitor occasionally
- **Long sessions** (50+ exchanges): Monitor continuously
- **Marathon sessions** (100+ exchanges): Proactive management critical

### Large Artifact Creation

**Creating large artifacts consumes context**:
- **Small** (< 2K tokens): No concern
- **Medium** (2K-5K tokens): Check remaining capacity
- **Large** (5K-10K tokens): Verify sufficient space
- **Very Large** (10K+ tokens): Consider compacting before creation

**Example**:
- Planning to create 12K token RCA
- Current usage: 175K tokens
- Remaining: 25K tokens
- **Action**: Compact first (create space), then create RCA

---

## Practical Guidelines

### Guideline 1: Comprehensive Documentation is Always Worth Tokens

**Situation**: Creating RCA, retrospective, instruction file, template

**Decision**: Create as comprehensively as needed, ignore token cost

**Rationale**: Incomplete documentation creates knowledge gaps costing hours of rework. Token cost is irrelevant compared to rework cost.

**Token Budget**: Unlimited for quality documentation

---

### Guideline 2: Monitor, Don't Micro-Optimize

**Situation**: General development work

**Decision**: Monitor token usage, don't optimize prematurely

**Rationale**: Context window is large (200K tokens). Most sessions won't approach limits. Monitor, manage when needed, don't preemptively truncate.

**Action**: Check token usage periodically, act at thresholds, ignore otherwise

---

### Guideline 3: Context Preservation During Compacting

**Situation**: Approaching context window limits (150K+ tokens)

**Decision**: Compact strategically, preserve high-value recent context

**Rationale**: Losing critical recent context breaks workflow. Compact completed/low-value context, keep active work state.

**Process**:
1. Identify high-value context (recent 20-30 exchanges, current work, active decisions)
2. Identify low-value context (completed tasks, resolved questions, exploratory discussions)
3. Use `/compact` to summarize low-value, preserve high-value
4. Verify critical context retained

---

### Guideline 4: Session Restart as Last Resort

**Situation**: Context window critically full (180K+ tokens), compacting insufficient

**Decision**: Restart session with state transfer

**Rationale**: Better to restart with clean context than lose state mid-work to window exhaustion.

**Process**:
1. Create comprehensive session state summary
2. Save to work log or file
3. Start fresh session
4. Load state summary at beginning
5. Continue work with full context window available

---

## Related Documentation

**Principles**:
- `complete_context_principle.instructions.md` - Complete context over sampling
- `quality_first_development.instructions.md` - Quality over efficiency

**Operations**:
- `/compact` command - Context window management tool
- Work logging - Persistent context beyond session

**Templates**:
- All templates optimize for quality over brevity
- RCA template, retrospective template, instruction file template

---

## Examples

### Example 1: Creating Comprehensive RCA

**Situation**: Creating first RCA, template is 15K tokens, final RCA may be 10K+ tokens

**Cost Optimization Approach** (WRONG):
- "RCA too long, let's make template brief (2K tokens)"
- "Reduce RCA to 3K tokens to save costs"
- **Result**: Incomplete RCA, missing critical analysis, no systematic prevention

**Quality Optimization Approach** (CORRECT):
- "RCA template is 15K tokens because comprehensive guidance prevents incomplete RCAs"
- "This RCA is 10K tokens because it captures complete failure chain, prevention frameworks, patterns"
- **Result**: Comprehensive RCA, systematic prevention, reusable meta-system
- **Token Cost**: ~25K tokens = ~$0.08 at $3/1M tokens
- **Value**: Prevents future incidents (hours of cost), establishes reusable framework

---

### Example 2: Long Session Context Management

**Situation**: 180K token usage, creating final RCA, need 20K more tokens

**Arbitrary Truncation** (WRONG):
- Remove oldest 50% of conversation
- **Risk**: May lose critical decisions, constraints, or context

**Strategic Preservation** (CORRECT):
1. Identify completed work earlier in session → Summarize outcomes
2. Preserve recent meta-system discussion → Keep full context
3. Use `/compact` to reduce completed work, keep active context
4. Verify RCA creation context preserved
5. Create RCA with full context available

---

### Example 3: Cost vs Quality Trade-off

**Situation**: Should instruction file include full examples or brief descriptions?

**Cost-Driven** (WRONG):
- "Brief descriptions save tokens"
- 500 token instruction file (minimal)
- **Result**: Agents misunderstand, need clarification, create incorrect implementations

**Quality-Driven** (CORRECT):
- "Full examples prevent misunderstanding"
- 3000 token instruction file (comprehensive)
- **Result**: Agents understand correctly, implement accurately, no rework
- **Token Cost**: 2500 additional tokens = ~$0.008
- **Rework Avoided**: 1 hour = $100+ equivalent
- **ROI**: $0.008 cost vs $100 value = 12,500x return

---

## Change Log

### 2025-11-16 (v1.0.0)
- Initial creation
- Established core principles: completeness over cost, context window as operational constraint
- Defined monitoring thresholds and management tactics
- Documented anti-patterns and practical guidelines
- Clarified token cost (negligible) vs context window (critical operational concern)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-16
