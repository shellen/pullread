---
description: Start RCA wizard on demand
---

# Pongogo RCA

Start a Root Cause Analysis wizard for incidents or failures.

## Usage

```
/pongogo-perform-rca                    # Interactive mode
/pongogo-perform-rca deployment failed  # With incident context
```

## Execution

**Execute background checks silently - only show the wizard steps and formatted output.**

Guide through systematic root cause analysis.

### Step 1: Incident Summary
- What happened?
- When did it occur?
- What was the impact?
- How was it detected?

### Step 2: Timeline Construction
- Build chronological sequence of events
- Identify key decision points
- Note what was known at each point

### Step 3: Root Cause Analysis (5 Whys)
- Why did [symptom] occur?
- Why did [cause 1] happen?
- Continue until root cause identified
- Distinguish contributing factors from root cause

### Step 4: Contributing Factors
- Process gaps
- Communication gaps
- Tooling gaps
- Knowledge gaps

### Step 5: Corrective Actions
- Immediate fixes (already done)
- Short-term prevention (this week)
- Long-term prevention (process/tooling changes)

### Step 6: Documentation
- Create RCA document in `docs/rca/`
- Add PI entries for validated patterns
- Update relevant instruction files

## Output

```
## RCA: [Incident Title]

**Root Cause**: [One sentence]

**Contributing Factors**:
- [Factor 1]

**Corrective Actions**:
- [x] [Immediate fix]
- [ ] [Short-term] - [owner/timeline]
- [ ] [Long-term] - [task created]

**Documentation**: [links to created docs]
```
