---
description: Run completion checklist on demand
---

# Pongogo Done

Run the issue completion checklist to ensure proper closure.

## Usage

```
/pongogo-complete-issue           # Current issue context
/pongogo-complete-issue #123      # Specific issue number
```

## Execution

Execute the completion process, surfacing only items needing attention.

### Phase 1: In Progress -> Ready for Review

1. **Deliverables** - Verify all acceptance criteria met
2. **Status Indicators** - All checkboxes marked
3. **Documentation** - Docs updated as needed
4. **Atomicity** - No deferred/blocked criteria
5. **Learning Loop** - Work log + learning execution
6. **Cross-Issue Impacts** - Update unblocked issues
7. **Completion Comment** - Summary added to issue
8. **Status Transition** - Move to "Ready for Review"

### Phase 2: User Review

9. **Approval** - Wait for user confirmation

### Phase 3: Closure

10. **Final Comment** - Note approval
11. **Close Issue** - Change status
12. **Project Board** - Move to "Done"
13. **Milestone** - Update checklist if applicable

## Output

```
## Completion Checklist: #[number]

### Items Needing Attention
- [ ] [Item description]

### Actions Taken
- [Action 1]

### Next Step
[What happens next]
```

If all pass:
```
All items complete. Ready for your approval to close.
```
