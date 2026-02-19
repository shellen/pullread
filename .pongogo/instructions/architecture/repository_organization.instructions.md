---
pongogo_instruction_spec: "0.0.2"
title: "Repository Organization"
description: "Repository structure and organization standards for consistent codebase layout."
applies_to:
  - "**/*"
domains:
  - "architecture"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - directory_structure
      - repository_organization
      - nested_+_prefixed
      - nested_prefixed
      - root_cleanliness
      - autocomplete
      - at_selector
      - self-documenting_names
      - directory_naming
      - folder_structure
      - gitignore_patterns
      - consistent_depth
      - root_pollution
      - parent_directory
      - subdirectory_naming
      - multi-stakeholder_optimization
    nlp: "Organizing repository directories for both human navigation and tool-based autocomplete using nested + prefixed patterns"
evaluation:
  success_signals:
    - Root directory under 15 items (excluding hidden)
    - Related directories grouped under parent
    - Nested + prefixed pattern applied
    - Self-documenting names (full words, not abbreviations)
    - "@ autocomplete works for prefixed directories"
  failure_signals:
    - Root pollution (many related items at root)
    - Pure nesting without prefixes (ambiguous autocomplete)
    - Cryptic abbreviations in directory names
    - Inconsistent depth across parallel categories
    - Code breaks due to hardcoded paths after refactoring
---


# Repository Organization Patterns

**Purpose**: Establish repository organization patterns optimizing for both human navigation and tool-based operations through nested + prefixed directory structures.

**Philosophy**: Best directory structures serve ALL stakeholders (humans, tools, agents) through synthesis, not compromise.

---

## When to Apply

- Creating new directory structures for features
- Noticing >3 related directories at same level
- Root directory contains >10 items (excluding config files)
- Directory purpose requires documentation to understand
- Tool-based file operations common (@ selectors, autocomplete)
- Planning directory structure for multi-mode systems (test/prod/dev)

---

## Quick Reference

**Nested + Prefixed Pattern**:

```
✅ Best of both worlds:
logs/
  logs-production/      ← @logs- autocompletes to all log dirs
  logs-testing/
  logs-learning/
.observability_db/
  observability_db-production/  ← @observability_db- autocompletes
  observability_db-testing/
  observability_db-learning/
```

**Anti-Patterns to Avoid**:

```
❌ Pure nesting (poor autocomplete):
logs/
  production/    ← @production matches many things
  testing/       ← @testing ambiguous

❌ Pure prefixing (root pollution):
logs-production/
logs-testing/
observability_db-production/
observability_db-testing/
```

**Benefits**:
- Root cleanliness: Parent directories group related items
- Tool optimization: Prefix-based @ autocomplete works
- Self-documenting: Full names over abbreviations
- Human navigable: Hierarchy provides organization

---

## Core Principles

- **Multi-Stakeholder Optimization**: Serve tools (@autocomplete) AND humans (navigation), not either/or
- **Self-Documenting Names**: Directory purpose should be immediately clear without context
- **Root Cleanliness**: Keep root scannable (<15 items), group related items under parent directories
- **Consistent Depth**: Maintain parallel structure across similar categories (don't mix flat and deep)
- **Scalability First**: Structure should accommodate future growth without root pollution

## Step-by-Step Guidance

### 1. Identify Related Directory Groups

**Action**: Find directories that share purpose or category

**Questions to Ask**:
- Do 3+ directories serve similar purpose? (logs, configs, tests)
- Do directory names share common prefixes? (test-*, prod-*, dev-*)
- Would grouping improve scanability?

**Example Analysis**:
```
❌ Before (6 root-level directories):
logs/
test-logs/
learning-logs/
.observability/
.test-observability/
.learning-observability/

✅ After (2 parent directories):
logs/          ← Group all log-related
.observability_db/  ← Group all observability-related
```

**Success Indicator**: >3 related items identified for consolidation

---

### 2. Design Parent Directory Structure

**Action**: Create clear, descriptive parent directory names

**Naming Guidelines**:
- Use full words, not abbreviations (`logs/` not `lg/`)
- Choose category name that encompasses all children
- Consider if directory will be hidden (`.observability_db/` for generated content)
- Avoid generic names (`data/`, `misc/`, `stuff/`)

**Example Decisions**:
- `logs/` for all event logs (production, testing, learning)
- `.observability_db/` for generated databases (hidden, rebuildable)
- `configs/` for all configuration files (dev, staging, prod)
- `docs/` for all documentation (guides, reference, API)

**Why Hidden Directories**:
- Generated content (`.observability_db/`)
- IDE-specific files (`.vscode/`)
- Build artifacts (`.cache/`)
- Use `.` prefix to hide from casual listing

---

### 3. Apply Nested + Prefixed Pattern

**Action**: Add parent directory prefix to subdirectory names

**Pattern Formula**:
```
parent_directory/
  parent_directory-mode_1/
  parent_directory-mode_2/
  parent_directory-mode_3/
```

**Why Add Prefix**:
- Tool autocomplete works: `@logs-` matches all log directories
- Unambiguous matching: `@logs-production` doesn't match `production/` in other contexts
- Self-documenting: `logs-production` is clearer than just `production`

**When NOT to Prefix**:
- Single subdirectory (no ambiguity)
- Subdirectory names already unique (`docs/api-reference/`, `docs/user-guides/`)
- Deep nesting where prefix becomes redundant

**Example Application**:
```
configs/
  configs-development/     ← @configs- autocompletes
  configs-staging/
  configs-production/

tests/
  tests-unit/              ← @tests- autocompletes
  tests-integration/
  tests-e2e/
```

---

### 4. Maintain Consistent Structure Depth

**Action**: Keep parallel categories at same depth level

**Good Example** (consistent depth):
```
logs/
  logs-production/
  logs-testing/
  logs-learning/

.observability_db/
  observability_db-production/
  observability_db-testing/
  observability_db-learning/
```

**Bad Example** (inconsistent depth):
```
logs/
  logs-production/
  test/
    integration/          ← Inconsistent depth
    unit/
  learning-dataset-logs/  ← Mixed naming
```

**Why Consistency Matters**:
- Predictable navigation patterns
- Easier to understand structure
- Simpler path construction in code
- Reduces cognitive load

---

### 5. Update Code and Documentation

**Action**: Update all references to use new structure

**Code Updates**:
```python
# Before (hardcoded paths)
log_path = "/logs/"
test_log_path = "/test-logs/"

# After (centralized path construction)
def get_log_path(mode: str) -> Path:
    base = Path("logs")
    if mode == 'testing':
        return base / "logs-testing"
    elif mode == 'learning':
        return base / "logs-learning"
    else:
        return base / "logs-production"
```

**Documentation Updates**:
- `.gitignore`: Update patterns for new structure
- `README.md`: Update directory structure documentation (if exists)
- Architecture docs: Update diagrams showing directory layout
- Setup guides: Update paths in installation instructions

**Example .gitignore**:
```gitignore
# Observability data (nested + prefixed structure)
# - logs/logs-{production,testing,learning}/ - JSONL event logs
# - .observability_db/observability_db-{production,testing,learning}/ - SQLite databases
.observability_db/
logs/
```

---

## Examples

### Example 1: Multi-Mode Logging Structure

```
# Task: Organize logs for production, testing, and learning modes
# Requirement: Clean root, @ autocomplete support

✅ Nested + Prefixed Solution:
logs/
  logs-production/
    routing-events-2025-11-10.jsonl
  logs-testing/
    routing-events-2025-11-10.jsonl
  logs-learning/
    routing-events-2025-11-10.jsonl

Benefits:
- Root: 1 directory (not 3)
- @logs- autocompletes to all log directories
- Immediately clear: "logs-production" = production logs
- Scalable: Add logs-benchmarking/ without root pollution
```

**Context**: Gen 1 Observability with log isolation

**Result**: 67% reduction in root-level clutter (6 dirs → 2 dirs)

---

### Example 2: Configuration Management

```
# Task: Organize configurations for dev, staging, production environments
# Requirement: Clear separation, tool-friendly navigation

✅ Nested + Prefixed Solution:
configs/
  configs-development/
    database.yml
    api_keys.yml
  configs-staging/
    database.yml
    api_keys.yml
  configs-production/
    database.yml
    api_keys.yml

Code Integration:
```python
from pathlib import Path

def get_config_path(environment: str) -> Path:
    """Get configuration directory for environment."""
    configs_base = Path("configs")
    return configs_base / f"configs-{environment}"

# Usage
config_dir = get_config_path("production")
db_config = config_dir / "database.yml"
```

**Context**: Multi-environment application deployment

**Trade-offs**: Slightly longer paths, but significantly better autocomplete and clarity

---

### Example 3: Refactoring Flat Structure

```
# Before (root pollution - 8 directories):
src/
tests/
test-data/
test-results/
docs/
doc-examples/
doc-api-reference/
scripts/

# After (nested + prefixed - 4 directories):
src/
tests/
  tests-unit/
  tests-integration/
  tests-e2e/
  tests-data/           ← Test data grouped with tests
  tests-results/        ← Test results grouped with tests
docs/
  docs-guides/
  docs-examples/
  docs-api-reference/
scripts/

Result:
- Root directories: 8 → 4 (50% reduction)
- Related items grouped logically
- @tests- and @docs- autocomplete working
```

**Refactoring Steps**:
1. Create parent directories (`tests/`, `docs/`)
2. Create prefixed subdirectories (`tests-unit/`, `docs-guides/`)
3. Move content from flat structure
4. Update code references
5. Update .gitignore patterns
6. Test that @ autocomplete works

---

## Validation Checklist

- [ ] Root directory has <15 items (excluding hidden files)
- [ ] Related directories grouped under parent directories
- [ ] Subdirectories use parent name as prefix
- [ ] Directory names are full words (not abbreviations)
- [ ] Consistent depth maintained across parallel categories
- [ ] @ autocomplete tested and working
- [ ] Code updated for new paths
- [ ] .gitignore patterns updated
- [ ] Documentation reflects new structure
- [ ] Can navigate structure easily (human test)

---

## Common Pitfalls

### Pitfall 1: Pure Nesting Without Prefixes

- ❌ **Problem**: Generic subdirectory names harm @ autocomplete
- **Example**: `logs/production/` makes `@production` ambiguous
- **Why it happens**: Optimizing only for human directory navigation
- ✅ **Solution**: Add parent name as prefix (`logs/logs-production/`)
- **Trade-off**: Slightly redundant path, but massive autocomplete improvement

### Pitfall 2: Pure Prefixing Without Nesting

- ❌ **Problem**: Root directory gets polluted with many related items
- **Example**: `logs-production/`, `logs-testing/`, `logs-learning/` all at root
- **Why it happens**: Optimizing only for tool autocomplete
- ✅ **Solution**: Nest under parent directory (`logs/logs-production/`)
- **Trade-off**: Extra directory level, but root stays clean

### Pitfall 3: Cryptic Abbreviations

- ❌ **Problem**: Directory purpose unclear without domain knowledge
- **Example**: `logs/prod/`, `logs/dev/`, `logs/tst/`
- **Why it happens**: Optimizing for brevity over clarity
- ✅ **Solution**: Use full words (`logs-production`, `logs-development`, `logs-testing`)
- **Benefit**: Self-documenting, no abbreviation lookup needed

### Pitfall 4: Inconsistent Depth

- ❌ **Problem**: Some categories flat, others deeply nested
- **Example**:
  ```
  logs/
    production/
  tests/
    unit/
      integration/
        e2e/           ← Inconsistent depth
  ```
- **Why it happens**: Evolving structure without refactoring
- ✅ **Solution**: Maintain parallel depth for similar categories
- **Example**:
  ```
  logs/
    logs-production/
  tests/
    tests-unit/
    tests-integration/
    tests-e2e/
  ```

---

## Edge Cases

### Edge Case 1: Single Subdirectory

**When**: Only one subdirectory under parent (e.g., `logs/` with only `production/`)

**Approach**: Don't add prefix yet - wait for second subdirectory
- `logs/production/` is fine for single mode
- Add prefix when adding second mode (`logs-production/`, `logs-testing/`)
- Prevents premature optimization

**Example**:
```
# Start simple
logs/
  production/

# Add prefix when scaling
logs/
  logs-production/
  logs-testing/      ← Now prefix makes sense
```

### Edge Case 2: Already Unique Subdirectory Names

**When**: Subdirectories have unique, descriptive names already

**Approach**: Prefix optional if no ambiguity
- `docs/api-reference/` is already unique
- `docs/user-guides/` is already unique
- No need for `docs-api-reference/` prefix

**Decision Framework**:
- Will `@api-reference` match multiple things? No → skip prefix
- Is subdirectory name generic (`production`, `testing`)? Yes → add prefix

### Edge Case 3: Very Long Directory Names

**When**: Parent + prefix creates unwieldy paths

**Approach**: Shorten parent name or accept trade-off
- `observability_db-production` vs `obs_db-production`
- Prefer clarity over brevity
- Long paths better than ambiguous autocomplete

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| @ autocomplete returns too many matches | Generic subdirectory names | Add parent prefix to subdirectories |
| Root directory cluttered | Related items not grouped | Create parent directories, nest related items |
| Can't find directories | Non-descriptive names | Use full words, add context to names |
| Inconsistent navigation | Mixed flat and deep structure | Standardize depth across parallel categories |
| Code breaks after refactoring | Hardcoded paths | Centralize path construction logic |
| Unclear directory purpose | Abbreviations or generic names | Use self-documenting full names |

---

## Related Instructions

- **See also**: [Naming and Organization](../../standards/naming_and_organization.md) - Overall naming conventions
- **Related**: [Project Organization Standards](../../standards/project_organization_standards.md) - Project structure guidelines

---

**Success Criteria**: Root directory scannable (<15 items), @ autocomplete returns correct directories, structure is self-documenting

**Confidence Check**: Can a new contributor understand the directory structure in <2 minutes without documentation? If yes, organization is successful.
