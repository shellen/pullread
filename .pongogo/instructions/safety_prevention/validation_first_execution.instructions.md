---
pongogo_instruction_spec: "0.0.2"
title: "Validation-First Execution"
description: "Validate before executing to prevent destructive actions and data loss."
applies_to:
  - "**/*"
domains:
  - "safety"
priority: "P1"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 0
  triggers:
    keywords:
      - dry_run
      - validation_first
      - validate_before
      - debug_flag
      - verbose_flag
      - help_flag
      - script_safety
      - bulk_operation
      - migration_script
      - deployment_script
    nlp: "Validation-first execution with dry-run, debug, verbose flags for scripts and operations, systematic prevention before execution"
evaluation:
  success_signals:
    - Script supports --help, --dry-run, --debug, --verbose flags
    - Dry-run executed before first real execution of any script
    - Current state queried before making modifications (targeted changes)
    - Debug output shows variable values and decision points
    - Post-execution validation confirms intended changes occurred
  failure_signals:
    - Script executes immediately without dry-run validation option
    - Dry-run shows all items as targets (not checking current state)
    - First execution skips dry-run due to confidence or time pressure
    - Debug flag enabled but doesn't show decision logic
    - No --help documentation for script flags and usage
---


# Validation-First Execution

**Purpose**: Establish systematic prevention pattern where all scripts and operations validate before executing to eliminate entire categories of errors.

**Philosophy**: Validate first, execute second - see what will happen before making it happen.

---

## When to Apply

Use validation-first execution when:

- Creating any script that modifies state (files, database, API calls)
- Running bulk operations affecting multiple items
- Executing deployment or migration scripts
- Making configuration changes
- Running operations for the first time
- Working with production data or systems

---

## Quick Reference

**Most Common Patterns**:

**1. Bash Script with Dry-Run**:
```bash
#!/bin/bash
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dry-run) DRY_RUN=true; shift ;;
    *) shift ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Would delete: $file"
else
  rm "$file"
fi
```

**2. Python Script with argparse**:
```python
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--debug', action='store_true')
args = parser.parse_args()

if args.dry_run:
    print(f"[DRY-RUN] Would update: {item}")
else:
    update_item(item)
```

**3. Always Run Dry-Run First**:
```bash
# First: See what will happen
./script.sh --dry-run

# Review output, then execute
./script.sh
```

**4. Debug Flag for Visibility**:
```python
if args.debug:
    print(f"DEBUG: Current state = {state}")
    print(f"DEBUG: Applying change = {change}")
```

---

## Core Principles

- **Dry-Run by Default**: Every script should support `--dry-run` to show what would happen without executing
- **Debug Visibility**: Use `--debug` flag to show detailed execution flow and decision points
- **Verbose Logging**: Implement `--verbose` for different levels of output detail
- **Help Always Available**: Every script must have `--help` documenting all flags and usage
- **Verify Current State**: Check existing state before making changes to understand impact

## Step-by-Step Guidance

### 1. **Implement Standard Safety Flags**
   - Add `--dry-run` (or `-d`): Show what would be done without making changes
   - Add `--debug`: Display detailed execution flow, variable values, decision logic
   - Add `--verbose` (or `-v`): Control log level (warnings, info, debug)
   - Add `--help` (or `-h`): Display usage, examples, and flag documentation
   - Expected outcome: Script supports all four safety flags

### 2. **Always Run Dry-Run First**
   - Execute script with `--dry-run` before real execution
   - Review proposed changes for correctness
   - Validate scope matches intention (no accidental bulk operations)
   - Expected outcome: Confident understanding of what will happen

### 3. **Verify Current State**
   - Query existing state before making modifications
   - Check if target items are already in desired state
   - Identify which items need changes vs which are already correct
   - Expected outcome: Targeted changes only, no unnecessary modifications

### 4. **Enable Debug for First-Time Execution**
   - Use `--debug` flag when running script for first time
   - Observe decision points and data flow
   - Verify logic behaves as expected
   - Expected outcome: Increased confidence through visibility

### 5. **Execute with Verbose Logging**
   - Run actual execution with `--verbose` for progress tracking
   - Monitor for unexpected behavior
   - Capture log output for post-execution review
   - Expected outcome: Complete audit trail of what happened

### 6. **Validate Post-Execution**
   - Check that intended changes occurred
   - Verify no unintended side effects
   - Confirm system state matches expectations
   - Expected outcome: Confirmed success or identified issues requiring correction

## Examples

### Example 1: Bash Script with Standard Safety Flags

Script implementing all four safety flags:

```bash
#!/bin/bash
# migrate-instructions.sh - Migrate instruction files to new structure

set -euo pipefail

# Default values
DRY_RUN=false
DEBUG=false
VERBOSE=false

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Migrate instruction files from old structure to new structure.

Options:
    -d, --dry-run          Show what would be done without making changes
    -v, --verbose          Enable verbose logging
    --debug                Enable debug mode (show all variable values and decisions)
    -h, --help             Show this help message

Examples:
    # See what would happen first
    $(basename "$0") --dry-run

    # Run with verbose output
    $(basename "$0") --verbose

    # Debug first-time execution
    $(basename "$0") --debug --dry-run

EOF
}

log_info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[INFO] $*"
    fi
}

log_debug() {
    if [[ "$DEBUG" == "true" ]]; then
        echo "[DEBUG] $*"
    fi
}

migrate_file() {
    local source="$1"
    local target="$2"

    log_debug "migrate_file called with source=$source, target=$target"

    # Verify current state
    if [[ -f "$target" ]]; then
        log_info "Target already exists: $target (skipping)"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] Would migrate: $source -> $target"
    else
        log_info "Migrating: $source -> $target"
        cp "$source" "$target"
        log_debug "Migration complete: $target"
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN=true
            echo "[DRY-RUN MODE] No changes will be made"
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --debug)
            DEBUG=true
            VERBOSE=true  # Debug implies verbose
            echo "[DEBUG MODE] Detailed execution logging enabled"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Error: Unknown option $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
log_debug "Starting migration with DRY_RUN=$DRY_RUN, VERBOSE=$VERBOSE, DEBUG=$DEBUG"

# Your script logic here
migrate_file "old/path/file.md" "new/path/file.md"

if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Dry-run complete. No changes were made."
    echo "[DRY-RUN] Run without --dry-run to apply changes."
fi
```

**Context**: Standard template for bash scripts requiring safety validation
**Expected Result**: Safe execution with visibility and validation

### Example 2: Python Script with Safety Flags

Python script implementing validation-first pattern:

```python
#!/usr/bin/env python3
"""
update-frontmatter.py - Update YAML frontmatter in instruction files

Implements validation-first execution with dry-run, debug, and verbose flags.
"""

import argparse
import logging
import sys
from pathlib import Path

def setup_logging(verbose: bool, debug: bool):
    """Configure logging based on flags"""
    if debug:
        level = logging.DEBUG
    elif verbose:
        level = logging.INFO
    else:
        level = logging.WARNING

    logging.basicConfig(
        level=level,
        format='[%(levelname)s] %(message)s'
    )

def update_frontmatter(file_path: Path, new_field: str, dry_run: bool) -> bool:
    """
    Update frontmatter in instruction file.

    Args:
        file_path: Path to instruction file
        new_field: New field to add
        dry_run: If True, only show what would happen

    Returns:
        True if update needed, False if already up-to-date
    """
    logging.debug(f"update_frontmatter called: file={file_path}, field={new_field}, dry_run={dry_run}")

    # Verify current state
    content = file_path.read_text()
    if new_field in content:
        logging.info(f"Skipping {file_path} - already has {new_field}")
        return False

    if dry_run:
        print(f"[DRY-RUN] Would add '{new_field}' to {file_path}")
        return True

    # Actual modification
    logging.info(f"Adding '{new_field}' to {file_path}")
    # ... update logic here ...
    logging.debug(f"Update complete: {file_path}")
    return True

def main():
    parser = argparse.ArgumentParser(
        description='Update YAML frontmatter in instruction files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # See what would happen (always run this first)
  %(prog)s --dry-run

  # Run with verbose output
  %(prog)s --verbose

  # Debug first execution
  %(prog)s --debug --dry-run

  # Apply changes
  %(prog)s
        '''
    )

    parser.add_argument('-d', '--dry-run', action='store_true',
                        help='Show what would be done without making changes')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Enable verbose logging')
    parser.add_argument('--debug', action='store_true',
                        help='Enable debug mode (implies verbose)')

    args = parser.parse_args()

    setup_logging(args.verbose, args.debug)

    if args.dry_run:
        print("[DRY-RUN MODE] No changes will be made\n")

    logging.debug(f"Arguments: {args}")

    # Main logic
    files_modified = 0
    for file_path in Path('knowledge/instructions').rglob('*.instructions.md'):
        if update_frontmatter(file_path, 'new_field', args.dry_run):
            files_modified += 1

    if args.dry_run:
        print(f"\n[DRY-RUN] Would modify {files_modified} files")
        print("[DRY-RUN] Run without --dry-run to apply changes")
    else:
        logging.info(f"Modified {files_modified} files")

if __name__ == '__main__':
    main()
```

**Context**: Standard template for Python scripts requiring safety validation
**Expected Result**: Safe execution with validation and visibility

### Example 3: Bulk Operation Safety

Validating before bulk GitHub operation:

```bash
#!/bin/bash
# bulk-update-issues.sh - Update multiple issues with safety validation

# 1. Query current state FIRST
echo "Checking current issue status..."
for issue_num in 45 46 47 48 49; do
    current_status=$(gh issue view "$issue_num" --json status -q '.status')
    echo "Issue #$issue_num: current status = $current_status"

    # Save to file for dry-run analysis
    echo "$issue_num:$current_status" >> /tmp/current_status.txt
done

# 2. Dry-run showing proposed changes
if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "[DRY-RUN] Proposed changes:"
    while IFS=: read -r issue current; do
        if [[ "$current" != "BACKLOG" ]]; then
            echo "[DRY-RUN] Would update #$issue: $current -> BACKLOG"
        else
            echo "[DRY-RUN] Skipping #$issue: already in BACKLOG"
        fi
    done < /tmp/current_status.txt

    echo ""
    echo "[DRY-RUN] Dry-run complete. Review proposed changes above."
    exit 0
fi

# 3. Actual execution (only runs if not dry-run)
while IFS=: read -r issue current; do
    if [[ "$current" != "BACKLOG" ]]; then
        echo "Updating #$issue: $current -> BACKLOG"
        gh issue edit "$issue" --add-project "{project}" --project-field "Status=Backlog"
    else
        echo "Skipping #$issue: already in BACKLOG"
    fi
done < /tmp/current_status.txt
```

**Context**: Bulk operations require current state verification to avoid accidental changes
**Expected Result**: Targeted changes only, no disruption of correctly-positioned items

## Validation Checklist

Before considering a script complete:

- [ ] `--help` flag implemented with usage examples
- [ ] `--dry-run` flag shows proposed changes without executing
- [ ] `--debug` flag displays detailed execution flow
- [ ] `--verbose` flag enables progress logging
- [ ] Script checks current state before making changes
- [ ] Dry-run output is clear and actionable
- [ ] Debug output shows variable values and decision points
- [ ] Script skips items already in desired state
- [ ] Post-execution validation confirms success
- [ ] Error handling provides recovery guidance

## Common Pitfalls

### Pitfall 1: No Dry-Run Flag

- ❌ **Problem**: Script executes immediately without validation opportunity
- **Why it happens**: Treating dry-run as optional instead of mandatory
- ✅ **Solution**: Always implement `--dry-run` flag, document in `--help`
- **Example**: Script that modifies 100 files without showing what it will do first

### Pitfall 2: Dry-Run Not Checking Current State

- ❌ **Problem**: Dry-run shows all items as targets, not just items needing changes
- **Why it happens**: Not querying current state before proposing changes
- ✅ **Solution**: Check existing state, only show items that need modification
- **Example**: "Would update 50 issues" when 45 are already in correct state

### Pitfall 3: Debug Output Missing Key Information

- ❌ **Problem**: Debug flag enabled but doesn't show decision logic
- **Why it happens**: Not logging variable values and conditional branches
- ✅ **Solution**: Log all decisions, variable states, and control flow
- **Example**: Script fails but debug output doesn't show which condition triggered failure

### Pitfall 4: Executing First-Time Without Dry-Run

- ❌ **Problem**: Running script in production without seeing what it will do
- **Why it happens**: Skipping validation step due to confidence or time pressure
- ✅ **Solution**: Make dry-run mandatory for first execution (block without flag)
- **Example**: Migration script that moves 1000 files unexpectedly

### Pitfall 5: No Help Documentation

- ❌ **Problem**: Script flags not documented, users don't know how to validate safely
- **Why it happens**: Treating documentation as optional
- ✅ **Solution**: Comprehensive `--help` with examples of safe usage
- **Example**: Script with `--dry-run` but users don't know it exists

## Edge Cases

### Edge Case 1: Dry-Run for Idempotent Operations

**When**: Operation can be safely run multiple times (already idempotent)
**Approach**:
- Still implement `--dry-run` to show scope of operation
- Use dry-run to confirm no unexpected side effects
- Document idempotency in help text
**Example**: Script that updates config only if value differs

### Edge Case 2: Debug Output Too Verbose

**When**: Debug flag produces overwhelming amount of output
**Approach**:
- Implement multiple verbosity levels (`-v`, `-vv`, `-vvv`)
- Default debug to showing decisions, use `-vv` for data dumps
- Provide `--debug-file` to write debug output to file instead of stdout
**Example**: Script processing 10,000 items needs tiered debug levels

### Edge Case 3: Dry-Run Cannot Fully Simulate

**When**: Operation depends on external API responses or runtime conditions
**Approach**:
- Document limitations in dry-run output
- Show best-effort simulation with warnings
- Recommend starting with small subset (add `--limit` flag)
**Example**: API migrations where response format can't be predicted

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Script runs without validation | No `--dry-run` flag implemented | Add dry-run flag, block execution without it for first run |
| Dry-run shows too many targets | Not checking current state | Query existing state, filter to items needing changes |
| Debug output unhelpful | Not logging decision points | Add logging at every conditional, log variable values |
| Can't understand what script does | No `--help` documentation | Write comprehensive help with examples |
| Unexpected bulk changes | Skipped dry-run validation | Mandate dry-run for first execution (exit with warning if skipped) |
| Script modifies wrong items | Incorrect scope validation | Add safeguards checking item IDs/patterns before changes |

## Related Instructions

- **See also**: [bash_script_maintenance.instructions.md](../scripting/bash_script_maintenance.instructions.md) - Comprehensive bash scripting standards including flag implementation
- **See also**: [python_script_development.instructions.md](../scripting/python_script_development.instructions.md) - Python scripting standards with argparse patterns
- **Prerequisites**: [agentic_decision_making.instructions.md](../agentic_workflows/agentic_decision_making.instructions.md) - Context-first thinking applies to validation-first execution
- **Related**: [bulk_operation_safety.instructions.md](./bulk_operation_safety.instructions.md) - Specific patterns for bulk operations

---

**Success Criteria**: All scripts support `--help`, `--dry-run`, `--debug`, and `--verbose` flags. First-time execution always uses dry-run. Current state verified before modifications.

**Confidence Check**: Can you run any script with `--help` and `--dry-run` to understand what it does before executing? Does debug output show decision logic?
