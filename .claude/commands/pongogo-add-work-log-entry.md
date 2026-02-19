---
description: Create work log entry on demand
---

# Pongogo Work Log

Add a structured entry to the project work log.

## Usage

```
/pongogo-add-work-log-entry                           # Interactive mode
/pongogo-add-work-log-entry completed the API refactor # Quick entry with context
```

## Entry Types

| Type | Use When |
|------|----------|
| Session Start | Beginning work |
| Decision | Key choice made |
| Blocker | Obstacle encountered/resolved |
| Completion | Task/Epic done |
| Learning | Pattern or insight discovered |
| Session End | Progress summary |

## Execution

**Execute silently and display only the formatted output.**

1. **Parse input** - Infer type from text or ask
2. **Gather details** - Get evidence, context, rationale
3. **Generate entry** - Use appropriate template
4. **Add to work log** - Insert at top of today's section
5. **Commit** - Stage and commit with descriptive message

## Output

Show only:
- Entry preview
- Confirmation of addition
- Commit status

---

**Location**: `wiki/Work-Log-YYYY-MM.md`
