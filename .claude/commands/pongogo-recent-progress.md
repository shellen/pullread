---
description: Project accomplishment summary
---

# Pongogo Recent Progress

Generate a summary of recent project accomplishments.

## Usage

```
/pongogo-recent-progress           # Last 7 days
/pongogo-recent-progress 14        # Last 14 days
/pongogo-recent-progress month     # Current month
```

## Execution

Gather and summarize recent work silently, then display results.

### Data Sources

1. **GitHub Issues** - Recently closed issues in active milestones
2. **Work Log** - Entries from specified period
3. **Commits** - Commit history summary
4. **Wiki** - Recent wiki updates

### Aggregation

- Group by milestone/epic
- Highlight key deliverables
- Count metrics (issues closed, commits, etc.)
- Identify patterns in work type

## Output

```
## Recent Progress: [Date Range]

### Milestone: [Name]
**Progress**: X/Y issues (Z%)

**Completed**:
- [Issue #] [Title]
- [Issue #] [Title]

**Key Deliverables**:
- [Deliverable 1]
- [Deliverable 2]

### Metrics
| Metric | Count |
|--------|-------|
| Issues Closed | X |
| Commits | Y |
| Work Log Entries | Z |

### Highlights
- [Notable accomplishment 1]
- [Notable accomplishment 2]
```

---

**Tip**: Use before standup meetings or status updates.
