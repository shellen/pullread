---
pongogo_instruction_spec: "0.0.2"
title: "Systematic Prevention Framework"
description: "Systematic framework for preventing recurring failures through pattern recognition."
applies_to:
  - "**/*"
domains:
  - "safety"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

evaluation:
  success_signals:
    - Every problem triggers prevention analysis before solving
    - Solution eliminates problem category (not just instance)
    - Prevention framework activates automatically without manual memory
    - Friction signals trigger PAUSE and prevention question analysis
    - Root cause addressed (not surface symptoms)
  failure_signals:
    - Fixing specific bug without asking what category it represents
    - Creating manual processes that rely on remembering to check
    - Point solution solves this instance but problem recurs
    - Prevention framework requires manual activation or consultation
    - Building new tools when decision pattern should be documented
---


# Systematic Prevention Framework

**Purpose**: Eliminate entire categories of problems through systematic frameworks rather than solving individual problem instances.

**Philosophy**: Never just solve problems—always create prevention mechanisms that make entire categories of problems impossible through proper protocols and agent-first design.

---

## When to Apply

Use systematic prevention framework when:

- Encountering any problem or error (ask "is this a pattern?")
- Creating solutions to specific issues
- Designing new features or systems
- Reviewing incidents or failures
- Building agent workflows and routing logic
- Creating instruction files or documentation

---

## Quick Reference

**Key Decision Criteria**:

**1. Systematic Prevention Questions (Ask Every Time)**:
- Is this a one-time issue or a pattern?
- Can we prevent this entire category of problems?
- What framework would make this impossible?
- Does a prevention mechanism already exist?

**2. Prevention vs Reaction**:
- ❌ Reaction: Fix this specific bug
- ✅ Prevention: Add validation framework preventing this bug class

**3. Examples of Category Elimination**:
- **Problem**: Flaky tests fail randomly
- **Prevention**: Deterministic validation framework (100% pass rate requirement)
- **Problem**: Agents forget manual steps
- **Prevention**: Automatic discovery through metadata (zero memory dependency)
- **Problem**: Destructive git operations
- **Prevention**: Git safety protocols with explicit confirmation

**4. Mandatory Analysis Before Solving**:
```
Before: "Fix failing test"
After: "Why is test flaky? Add framework preventing non-deterministic tests"

Before: "Update documentation"
After: "Why was documentation unclear? Add instruction file with machine-readable patterns"
```

**5. Integration into Workflow**:
- Prevention becomes automatic (not manual checklist)
- Runs as part of existing process (not separate step)
- Fails loudly when violated (not warning)

---

## Core Principles

- **Category Elimination**: Prevent problem categories, not individual instances
- **Mandatory Prevention Analysis**: Before solving any problem, identify what framework could eliminate the category
- **Agent-First Design**: Prevention frameworks must work automatically without manual memory
- **Root Cause Focus**: Address underlying causes creating problems, not surface symptoms
- **Process Integration**: Prevention becomes part of standard workflows, not bolt-on safeguards

## Step-by-Step Guidance

### 1. **Identify Problem Pattern**
   - Analyze current problem: What specifically went wrong?
   - Pattern recognition: Is this a one-time issue or representative of a category?
   - Scope assessment: How many similar problems could exist?
   - **Friction signal check**: Did this trigger user friction? (See below)
   - Expected outcome: Understanding whether this is instance or pattern

### 2. **Ask Mandatory Prevention Questions**
   - Question 1: Is this a one-time issue or representative of a pattern?
   - Question 2: What systematic framework could eliminate this entire problem category?
   - Question 3: How can we make the correct approach the automatic approach?
   - Expected outcome: Clear vision of prevention framework needed

### 3. **Design Prevention Framework**
   - Root cause analysis: What system gap allowed this problem to occur?
   - Framework scope: What category of problems does this prevent?
   - Automatic enforcement: How will framework activate without manual triggers?
   - Agent-first integration: How do agents discover and apply this framework?
   - Expected outcome: Complete prevention framework design

### 4. **Implement Agent-First Prevention**
   - Create instruction files with `applies_to` patterns for automatic discovery
   - Integrate with existing tools (routing service, validation gates, etc.)
   - Design context-aware activation based on work patterns
   - Ensure zero manual dependency (works without agents remembering)
   - Expected outcome: Prevention framework discoverable and automatic

### 5. **Validate Framework Effectiveness**
   - Test with scenarios beyond original problem instance
   - Verify automatic discovery and application
   - Confirm prevention of problem category, not just original instance
   - Document framework in institutional knowledge system
   - Expected outcome: Validated framework preventing problem category

## Examples

### Example 1: Routing Service Instruction Discovery

Context: Agent failed to consult relevant instructions during feature implementation

```markdown
## ❌ WRONG: Point Solution
Problem: Agent didn't read security_patterns.instructions.md during auth implementation
Solution: "Remember to check instruction files before implementing features"

Why Wrong:
- Solves individual instance (this one agent, this one feature)
- Relies on agent memory (manual process)
- Doesn't prevent category (agents will forget again)

## ✅ CORRECT: Systematic Prevention Framework
Problem Category: Agents not consulting relevant instructions during work
Root Cause: No automatic instruction discovery based on work context

Prevention Framework: Knowledge Routing System
- Automatic Discovery: Routing service matches file paths to `applies_to` patterns
- Context-Aware Activation: Current file/domain triggers relevant instructions
- Agent-First Integration: Instructions loaded automatically when context matches
- Zero Memory Dependency: Works without agents remembering to consult

Implementation:
1. Create routing service scanning file paths against instruction metadata
2. Load relevant instructions when agent works in matching contexts
3. Integrate with MCP server for automatic activation
4. Document in knowledge_routing_design.md architecture

Result:
- Problem category eliminated: Agents always have relevant instructions
- Automatic enforcement: No manual consultation required
- Institutional knowledge: Routing patterns preserved in architecture
```

**Context**: Agent-first design requires automatic instruction discovery
**Expected Result**: Entire category of "missed instruction" problems eliminated through routing service

### Example 2: Validation Framework Pattern

Context: Test failed because environment variable missing, agent didn't catch during development

```markdown
## ❌ WRONG: Point Solution
Problem: Missing DATABASE_URL environment variable caused test failure
Solution: "Add DATABASE_URL to .env file"

Why Wrong:
- Solves this one variable, not category
- Doesn't prevent next missing variable
- Reactive (catches after failure, not before)

## ✅ CORRECT: Systematic Prevention Framework
Problem Category: Missing required environment variables causing runtime failures
Root Cause: No validation of environment configuration at service startup

Prevention Framework: Environment Validation at Startup
- Validation-First Pattern: Every service validates env vars before operations
- Explicit Requirements: env_requirements.yml defines required variables per service
- Fail-Fast Design: Service refuses to start if required vars missing
- Clear Error Messages: Tells developer exactly which vars needed

Implementation:
1. Create agent_environment_setup.instructions.md with validation pattern
2. Add startup validation to microservices_development.instructions.md
3. Create env_requirements.yml schema for each service
4. Integrate validation into Docker container entrypoint scripts

Result:
- Problem category eliminated: Missing env vars caught at startup, not runtime
- Developer experience: Clear error messages guide configuration
- Institutional pattern: All future services follow validation pattern
```

**Context**: Microservices architecture needs environment validation
**Expected Result**: All missing environment variable problems prevented at startup

### Example 3: Trust-Based Execution Framework

Context: Agent re-analyzed completed phase instead of implementing recommendations

```markdown
## ❌ WRONG: Point Solution
Problem: Agent questioned initial analysis and re-did work during implementation
Solution: "Trust the previous analysis and implement as specified"

Why Wrong:
- Solves this one instance of distrust
- Doesn't prevent pattern of re-analysis
- Manual guidance, not systematic framework

## ✅ CORRECT: Systematic Prevention Framework
Problem Category: Agents re-analyzing completed work instead of trusting validation
Root Cause: No clear trust protocol for phase boundaries and validation gates

Prevention Framework: Trust-Based Phase Execution with SC/AC/CV Gates
- Trust Foundation: SC/AC/CV validation gates establish trust during work
- Linear Progression: Each phase trusts previous phase outputs
- Cross-Session Trust: Trust extends across sessions via verification efficiency
- Meta-System Learning: Improve future criteria, don't question past completion

Implementation:
1. Create trust_based_task_execution.instructions.md (P0 priority)
2. Document SC/AC/CV gates in feature_development.instructions.md
3. Integrate with verification_efficiency.instructions.md for cross-session trust
4. Make trust-based execution universal pattern (`applies_to: "**/*"`)

Result:
- Problem category eliminated: Agents trust completed phases systematically
- Efficiency gains: No re-analysis waste, linear time complexity
- Learning culture: Improvements feed forward, not backward-looking doubt
```

**Context**: Multi-phase feature team coordination requires trust framework
**Expected Result**: Re-analysis anti-pattern eliminated through systematic trust protocols

## Validation Checklist

Before implementing any solution:

- [ ] Problem pattern identified (instance vs category)
- [ ] Mandatory prevention questions answered
- [ ] Root cause analysis completed (not just symptoms)
- [ ] Prevention framework designed (eliminates category)
- [ ] Agent-first integration planned (automatic discovery)
- [ ] Process integration defined (part of standard workflow)
- [ ] Validation scenarios beyond original problem defined
- [ ] Institutional knowledge documentation planned

After implementing prevention framework:

- [ ] Framework prevents problem category, not just instance
- [ ] Automatic activation verified (no manual memory required)
- [ ] Works with existing tools (no new tool dependencies)
- [ ] Instruction files created with proper `applies_to` patterns
- [ ] Cross-referenced in related instruction files
- [ ] Tested with scenarios beyond original problem
- [ ] Documented in architecture and knowledge system

## Common Pitfalls

### Pitfall 1: Solving Individual Problems Without Prevention Analysis

- ❌ **Problem**: Fixing specific bug without asking "what category does this represent?"
- **Why it happens**: Action bias, pressure to solve quickly
- ✅ **Solution**: Mandatory pause before fixing, ask prevention questions first
- **Example**: Fix this auth bug → Ask "what authentication framework prevents this category?"

### Pitfall 2: Creating Manual Processes Instead of Systematic Frameworks

- ❌ **Problem**: "Remember to check X before doing Y" (relies on memory)
- **Why it happens**: Treating humans/agents as responsible for remembering
- ✅ **Solution**: Design automatic discovery and enforcement, not manual checklists
- **Example**: "Remember to consult instructions" → Build routing service for automatic instruction loading

### Pitfall 3: Building Tools Instead of Documenting Patterns

- ❌ **Problem**: Creating new scripts/tools when decision pattern should be documented
- **Why it happens**: Tool-first thinking instead of knowledge-first approach
- ✅ **Solution**: Document decision frameworks in instruction files, leverage existing tools
- **Example**: Build custom analyzer → Document analysis patterns in instructions for agent inference

### Pitfall 4: Preventing Symptoms Instead of Root Causes

- ❌ **Problem**: Adding validation layers that catch problems after they occur
- **Why it happens**: Reactive instead of proactive prevention design
- ✅ **Solution**: Eliminate root cause so problem category cannot occur
- **Example**: Validate env vars after startup failure → Validate at startup so service won't run without vars

### Pitfall 5: Prevention Without Agent-First Design

- ❌ **Problem**: Prevention framework requires manual activation or consultation
- **Why it happens**: Not considering agent discovery and automation
- ✅ **Solution**: Integrate with routing service, use `applies_to` patterns, automatic triggers
- **Example**: Manual instruction lookup → Automatic instruction routing based on context patterns

## Friction Signals as Prevention Triggers (Routing IMP-018)

**Principle**: Friction signals are real-time evidence that a problem category needs prevention.

### Friction Detection Patterns

When users express these signals, a systematic gap has been exposed:

| Friction Signal | What It Reveals | Prevention Question |
|-----------------|-----------------|---------------------|
| "yet another example of" | Recurring issue (pattern!) | What framework prevents this category? |
| "i thought we changed this" | Expectation not met | Why did expectation differ from reality? |
| "without going through process" | Process being bypassed | How to make process automatic, not optional? |
| "you're skipping" | Steps being missed | What gate ensures step cannot be skipped? |
| "we already discussed this" | Previous guidance lost | How to capture guidance for automatic routing? |

### Friction → Prevention Workflow

1. **Detect friction signal** → PAUSE current work
2. **Ask prevention questions**:
   - Is this a one-time issue or pattern?
   - What category does this represent?
   - What framework prevents this category?
3. **Capture learning** → Document for mini-retro
4. **Design prevention** → If pattern, create framework
5. **Resume work** → With corrected approach

### Why Friction Signals Matter for Prevention

- **Real-time evidence**: User friction = confirmed gap in current systems
- **84% correlation**: Friction signals (correction_signal type) indicate preventable issues
- **Two benefits**: (1) Fix immediate issue, (2) Prevent future category
- **Learning source**: Each friction event should feed into meta-system improvement

### Example: Friction → Prevention

```markdown
## Friction Event
User: "yet another example of not checking the wiki first"

## Prevention Analysis
1. Pattern identified: Agents not checking wiki before decisions
2. Category: Information source consultation gaps
3. Root cause: No automatic wiki routing based on decision context

## Prevention Framework
- Add wiki pages to routing triggers based on decision domains
- Create instruction: "wiki_consultation.instructions.md"
- Automatic activation: Decision keywords → wiki pages surface

## Result
Category prevented: Future decisions in same domain automatically get wiki context
```

## Edge Cases

### Edge Case 1: True One-Time Issues (Not Patterns)

**When**: Problem genuinely is one-time with no recurrence likelihood
**Approach**:
- Still ask prevention questions to confirm it's truly one-time
- Document decision: "Confirmed one-time because..."
- Solve efficiently without framework overhead
- Monitor: If recurs, upgrade to prevention framework
**Example**: Corrupted file from disk failure → Fix file, confirm hardware issue, monitor for pattern

### Edge Case 2: Prevention Framework Too Complex for Value

**When**: Building prevention framework costs more than accepting occasional instance
**Approach**:
- Document cost-benefit analysis explicitly
- Create lightweight guidance instead of automated enforcement
- Set recurrence threshold for upgrading to full framework
- Preserve decision rationale in documentation
**Example**: Rare edge case occurring <1x/year → Document handling in troubleshooting section, not full automation

### Edge Case 3: Conflicting Prevention Frameworks

**When**: Two prevention frameworks interfere with each other
**Approach**:
- Identify conflict root cause (usually scope overlap)
- Redesign frameworks to be complementary, not contradictory
- Use priority levels (P0 > P1 > P2) when conflict unavoidable
- Document precedence rules in both framework instruction files
**Example**: Safety framework requires validation, speed framework skips checks → Define when each applies

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Same problem recurring | Point solution instead of prevention framework | Analyze problem category, design framework eliminating root cause |
| Prevention framework not applied | Agent-first design missing | Add `applies_to` patterns, integrate with routing service |
| Agents bypass prevention | Manual activation required | Make automatic through context-aware triggers |
| Prevention too complex | Over-engineered solution | Simplify to essential pattern, leverage existing tools |
| Framework conflicts with workflow | Bolt-on instead of integration | Redesign as part of standard workflow |
| Prevention doesn't scale | Instance-specific solution | Generalize to category-level framework |

## Related Instructions

- **See also**: [agentic_decision_making.instructions.md](../agentic_workflows/agentic_decision_making.instructions.md) - Inference patterns support systematic prevention over point solutions
- **Prerequisites**: [validation_first_execution.instructions.md](./validation_first_execution.instructions.md) - Validation-first is specific application of systematic prevention
- **Integration**: [instruction_file_creation.instructions.md](../documentation/instruction_file_creation.instructions.md) - Prevention frameworks documented in instruction files for agent discovery
- **Example**: [trust_based_task_execution.instructions.md](../trust_execution/trust_based_task_execution.instructions.md) - Trust framework eliminates re-analysis problem category

---

**Success Criteria**: Every problem triggers prevention analysis. Solutions eliminate problem categories through agent-first frameworks integrated into standard workflows. No recurring problems that could be systematically prevented.

**Confidence Check**: Are you solving this specific instance or eliminating the problem category? Will this framework work automatically without agents remembering it exists? Have you asked the three mandatory prevention questions?
