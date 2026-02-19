---
pongogo_instruction_spec: "0.0.2"
title: "Observability Testing"
description: "Testing standards for observability, monitoring, and diagnostic instrumentation."
applies_to:
  - "**/*"
domains:
  - "testing"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - observability_testing
      - log_isolation
      - test_isolation
      - five-test_framework
      - JSONL_validation
      - data_capture
      - validation_suite
      - cross-contamination
      - sequential_testing
      - backward_compatibility
    nlp: "Testing observability systems with log isolation, five-test validation framework, data capture verification, and cross-contamination prevention"
evaluation:
  success_signals:
    - All 5 validation tests pass (standard, testing, learning, backward compat, invalid)
    - Logs isolated correctly with no cross-contamination between modes
    - Data format verified (JSONL parseable by standard tools)
    - Database rebuildable from JSONL source of truth
    - Tests run sequentially to verify isolation from previous tests
  failure_signals:
    - Tests run in parallel losing isolation verification
    - Cross-contamination detected between production and testing logs
    - Missing backward compatibility testing (legacy state files)
    - JSONL format validation skipped (trusting without verification)
    - Silent failures on invalid configuration values
---


# Observability Testing Patterns

**Purpose**: Define systematic testing approach for observability systems ensuring data capture, validation, and operational readiness across multiple isolation modes.

**Philosophy**: Observability systems require multi-dimensional validation (functionality, data completeness, performance, isolation) beyond standard feature testing.

---

## When to Apply

- Testing logging or observability systems
- Validating data capture pipelines
- Implementing log isolation strategies (test/production/learning separation)
- Preparing observability for production deployment
- Verifying data completeness and format correctness
- Testing backward compatibility with legacy configurations

---

## Quick Reference

**Five-Test Framework for Observability Validation**:
1. **Standard Mode**: Default production configuration
2. **Isolation Mode 1**: First alternative mode (e.g., testing)
3. **Isolation Mode 2**: Second alternative mode (e.g., learning)
4. **Backward Compatibility**: Missing/legacy configuration
5. **Invalid Input**: Validation and error handling

**Success Criteria per Test**:
- Data captured in correct location
- Correct isolation (no cross-contamination)
- Database/index updated if applicable
- Performance within limits
- No silent failures

---

## Core Principles

- **Test Isolation**: Production and test data must never mix - parameter-based routing prevents cross-contamination
- **Multi-Dimensional Validation**: Verify functionality, data format, performance, and storage in every test
- **Sequential Execution**: Tests must run in order to verify isolation from previous tests
- **No Silent Failures**: Invalid configurations must fail loudly with actionable error messages
- **Data as Source of Truth**: JSONL/immutable formats are authoritative, indexes/databases are rebuildable

## Step-by-Step Guidance

### 1. Design Log Isolation Strategy

**Action**: Implement parameter-based routing to separate directories

**Implementation**:
```python
def get_log_paths(state, project_root):
    """Route logs based on isolation parameter."""
    log_comment = state.get('log_comment', '')

    if log_comment == 'testing':
        return project_root / "logs/logs-testing"
    elif log_comment == 'learning':
        return project_root / "logs/logs-learning"
    else:
        # Standard production (empty or unset)
        return project_root / "logs/logs-production"
```

**Why This Matters**:
- Prevents production data pollution during testing
- Enables safe A/B testing without impacting real data
- Supports dataset collection for learning/training

**Success Indicator**: Test data routes to separate directory, production logs unchanged

---

### 2. Create Five-Test Validation Suite

**Action**: Design tests covering all operational modes plus edge cases

**Test Suite Structure**:

**Test 1: Standard Production Mode**
- Configuration: Default/production settings (parameter empty or unset)
- Expected: Data routes to production location
- Validation: Check file exists, entry count, content format

**Test 2: Isolation Mode 1 (Testing)**
- Configuration: Testing mode parameter set (`log_comment="testing"`)
- Expected: Data routes to testing location, isolated from production
- Validation: Production logs unchanged, testing logs created

**Test 3: Isolation Mode 2 (Learning)**
- Configuration: Learning mode parameter set (`log_comment="learning"`)
- Expected: Data routes to learning location
- Validation: Both production and testing logs unchanged

**Test 4: Backward Compatibility**
- Configuration: Missing parameter key (simulates old state file)
- Expected: Graceful degradation to production mode
- Validation: No errors, defaults to production location correctly

**Test 5: Invalid Input Validation**
- Configuration: Invalid parameter value (`log_comment="invalid"`)
- Expected: Clear error raised, no silent failure
- Validation: `ValueError` with actionable message, no partial writes

**Execution Order**: Must be sequential, not parallel
- Each test verifies isolation from previous tests
- Cross-contamination detection requires ordered execution

---

### 3. Verify Data Capture Completeness

**Action**: Validate captured data meets format and completeness requirements

**What to Verify**:
```bash
# 1. Format correctness (JSONL parseable)
tail -1 logs/logs-production/events.jsonl | python3 -m json.tool

# 2. Entry count matches expectations
wc -l logs/logs-production/events.jsonl

# 3. Database exists and is reasonable size
ls -lh .observability_db/observability_db-production/routing_log-production.db

# 4. No cross-contamination
wc -l logs/logs-testing/events.jsonl  # Should only have Test 2 entry
```

**Success Criteria**:
- All JSONL entries parseable by standard tools (jq, python json.tool)
- Entry counts match test execution (1 per test in correct location)
- Database files created with reasonable sizes
- Zero entries in isolation directories when not in that mode

---

### 4. Validate Rebuild Capability

**Action**: Verify immutable source (JSONL) can rebuild queryable index (SQLite/other)

**Test Procedure**:
1. Capture events to JSONL (primary source)
2. Build SQLite database from JSONL
3. Delete SQLite database
4. Rebuild SQLite from JSONL
5. Verify queries return identical results

**Why This Matters**:
- JSONL is source of truth (Git-tracked, immutable, append-only)
- SQLite/indexes are ephemeral (`.gitignore`'d, rebuildable from source)
- Must be able to recover from database corruption/loss without data loss

**Example**:
```bash
# Query current database state
sqlite3 .observability_db/observability_db-production/routing_log-production.db "SELECT COUNT(*) FROM routing_events" > before.txt

# Simulate corruption by deleting database
rm .observability_db/observability_db-production/routing_log-production.db

# Trigger adapter (send any message) - adapter auto-recovers
# Next routing event will:
# 1. Detect missing/invalid database
# 2. Automatically reinitialize schema
# 3. Continue writing events

# Verify database recreated (will only have NEW events, not historical)
sqlite3 .observability_db/observability_db-production/routing_log-production.db "SELECT COUNT(*) FROM routing_events"

# Historical data remains in JSONL (source of truth)
wc -l logs/logs-production/routing-events-*.jsonl
```

---

### 5. Measure Storage Overhead

**Action**: Validate storage requirements are acceptable

**Metrics to Track**:
- JSONL size per event (average, max)
- Database size growth rate
- Total storage for N events
- Acceptable limit (e.g., <100MB for 1000 events)

**Example Measurement**:
```bash
# Measure after validation tests
du -sh logs/
du -sh .observability_db/

# Calculate per-event average
EVENTS=$(wc -l < logs/logs-production/events.jsonl)
SIZE=$(du -sb logs/logs-production/events.jsonl | cut -f1)
echo "Average: $((SIZE / EVENTS)) bytes/event"
```

**Decision Framework**:
- <100KB per 100 events: Excellent
- 100KB-500KB per 100 events: Acceptable
- >500KB per 100 events: Investigate (possible data bloat)

---

## Examples

### Example 1: Complete Validation Suite (Bash Script)

```bash
#!/bin/bash
# complete_observability_validation.sh

echo "=== Observability Validation Suite ==="
echo ""

# Test 1: Standard Production Mode
echo "Test 1: Standard Production Mode"
python3 scripts/toggle_mode.py --mode enabled
# Submit test message here
sleep 2
if [ -f logs/logs-production/events.jsonl ]; then
    echo "✅ Production log created"
    wc -l logs/logs-production/events.jsonl
else
    echo "❌ Production log missing"
    exit 1
fi

# Test 2: Testing Mode
echo ""
echo "Test 2: Testing Mode"
python3 scripts/toggle_mode.py --mode enabled --log-comment testing
# Submit test message here
sleep 2
if [ -f logs/logs-testing/events.jsonl ]; then
    echo "✅ Testing log created"
    # Verify production unchanged
    PROD_COUNT=$(wc -l < logs/logs-production/events.jsonl)
    if [ "$PROD_COUNT" -eq 1 ]; then
        echo "✅ Production isolated (still 1 entry)"
    else
        echo "❌ Production contaminated"
        exit 1
    fi
else
    echo "❌ Testing log missing"
    exit 1
fi

# Test 3: Learning Mode
echo ""
echo "Test 3: Learning Mode"
python3 scripts/toggle_mode.py --mode enabled --log-comment learning
# Submit test message here
sleep 2
if [ -f logs/logs-learning/events.jsonl ]; then
    echo "✅ Learning log created"
    # Verify both production and testing unchanged
    PROD_COUNT=$(wc -l < logs/logs-production/events.jsonl)
    TEST_COUNT=$(wc -l < logs/logs-testing/events.jsonl)
    if [ "$PROD_COUNT" -eq 1 ] && [ "$TEST_COUNT" -eq 1 ]; then
        echo "✅ Production and testing isolated"
    else
        echo "❌ Cross-contamination detected"
        exit 1
    fi
else
    echo "❌ Learning log missing"
    exit 1
fi

# Test 4: Backward Compatibility
echo ""
echo "Test 4: Backward Compatibility"
# Remove log_comment key from state file
python3 -c "import json; state = json.load(open('.state.json')); del state['log_comment']; json.dump(state, open('.state.json', 'w'))"
# Submit test message here
sleep 2
PROD_COUNT=$(wc -l < logs/logs-production/events.jsonl)
if [ "$PROD_COUNT" -eq 2 ]; then
    echo "✅ Backward compatibility: defaulted to production"
else
    echo "❌ Backward compatibility failed"
    exit 1
fi

# Test 5: Invalid Value Validation
echo ""
echo "Test 5: Invalid Value Validation"
python3 scripts/toggle_mode.py --mode enabled --log-comment invalid 2>&1 | grep -q "Invalid log_comment"
if [ $? -eq 0 ]; then
    echo "✅ Invalid value rejected correctly"
else
    echo "❌ Invalid value not rejected"
    exit 1
fi

echo ""
echo "=== All Tests Passed ✅ ==="
```

**Context**: Complete end-to-end validation script for observability system with 5 isolation tests

**Expected Result**: All 5 tests pass, logs created in correct locations, no cross-contamination detected

---

### Example 2: Data Format Validation (Python)

```python
#!/usr/bin/env python3
"""Validate JSONL format and schema correctness."""

import json
import sys
from pathlib import Path

def validate_jsonl_file(file_path: Path) -> tuple[bool, list[str]]:
    """
    Validate JSONL file format and schema.

    Returns:
        (success, errors): Boolean success and list of error messages
    """
    errors = []

    if not file_path.exists():
        return False, [f"File not found: {file_path}"]

    try:
        with open(file_path) as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    # Validate JSON parseable
                    event = json.loads(line)

                    # Validate required fields
                    required_fields = ['timestamp', 'message', 'mode']
                    missing = [f for f in required_fields if f not in event]
                    if missing:
                        errors.append(f"Line {line_num}: Missing fields {missing}")

                    # Validate mode value
                    valid_modes = ['enabled', 'disabled', 'simulate']
                    if event.get('mode') not in valid_modes:
                        errors.append(f"Line {line_num}: Invalid mode '{event.get('mode')}'")

                except json.JSONDecodeError as e:
                    errors.append(f"Line {line_num}: JSON decode error: {e}")

    except Exception as e:
        return False, [f"Error reading file: {e}"]

    return len(errors) == 0, errors

# Usage
if __name__ == '__main__':
    file_path = Path(sys.argv[1])
    success, errors = validate_jsonl_file(file_path)

    if success:
        print(f"✅ {file_path}: Valid JSONL format")
        sys.exit(0)
    else:
        print(f"❌ {file_path}: Validation failed")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
```

**Context**: Standalone validation script for JSONL format and schema correctness

**Usage**: `python3 validate_jsonl.py logs/logs-production/events.jsonl`

---

## Validation Checklist

- [ ] Log isolation implemented (parameter-based routing)
- [ ] Five-test validation suite created and passing
- [ ] Data format validation passing (JSONL parseable)
- [ ] Entry counts match expectations (1 per test in correct location)
- [ ] Database/index created correctly
- [ ] Rebuild from source works (delete DB, rebuild, verify)
- [ ] Storage overhead acceptable (<100KB per 100 events)
- [ ] Cross-contamination tests passing (isolation verified)
- [ ] Backward compatibility verified (missing parameter defaults)
- [ ] Invalid input rejected (ValueError raised with clear message)
- [ ] Performance within limits (latency, overhead measured)

---

## Common Pitfalls

### Pitfall 1: Testing All Modes in Parallel

- ❌ **Problem**: Running all 5 tests concurrently loses isolation verification
- **Why it happens**: Attempting to speed up test execution
- ✅ **Solution**: Run tests sequentially to verify no cross-contamination
- **Example**: Test 2 must verify production logs unchanged from Test 1

### Pitfall 2: Skipping Backward Compatibility Testing

- ❌ **Problem**: Legacy state files without new parameters cause silent failures
- **Why it happens**: Assuming all installations have latest state file format
- ✅ **Solution**: Always test with missing parameter key (graceful degradation)
- **Example**: Old state file without `log_comment` key should default to production

### Pitfall 3: Trusting Format Without Verification

- ❌ **Problem**: JSONL may be malformed but tests pass anyway
- **Why it happens**: Not validating with standard tools (jq, json.tool)
- ✅ **Solution**: Run format validation on every test log file
- **Example**: `tail -1 logs/logs-testing/events.jsonl | python3 -m json.tool`

### Pitfall 4: Batch Testing Before Refactoring

- ❌ **Problem**: Running all tests before fixing structural issues revealed by Test 1
- **Why it happens**: Attempting to batch all testing before any fixes
- ✅ **Solution**: If Test 1 reveals structural issues, refactor immediately before Tests 2-5
- **Example**: Directory refactoring between Test 1 and Tests 2-5 for 0% rework

---

## Edge Cases

### Edge Case 1: Very Large Messages

**When**: Observability system captures messages >100KB (code snippets, large diffs)

**Approach**: Implement message truncation or excerpt strategy
- Store full message in JSONL (source of truth)
- Store excerpt in database (for display/search)
- Provide link/reference to full content

**Example**:
```python
def format_message_excerpt(message: str, max_length: int = 500) -> str:
    """Truncate message for database storage."""
    if len(message) <= max_length:
        return message
    return message[:max_length] + "... (truncated)"
```

### Edge Case 2: Rapid Mode Switching

**When**: Tests switch between modes rapidly (< 1 second apart)

**Approach**: Add small delay or state verification
- Verify state file written before triggering event
- Add 1-2 second delay between mode switches
- Check adapter has reloaded state before proceeding

### Edge Case 3: Disk Space Exhaustion

**When**: Observability logs grow unbounded until disk full

**Approach**: Implement rotation and cleanup strategy
- Daily rotation: `logs-YYYY-MM-DD.jsonl`
- Automatic cleanup: Delete logs older than N days
- Storage limits: Alert when >X% disk usage

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Logs not created | State file not updated | Verify state file written correctly before test |
| Wrong directory | Parameter not read | Check adapter reads state before routing |
| Cross-contamination | Parallel execution | Run tests sequentially, verify isolation |
| Format errors | Invalid JSON | Validate each line with `python3 -m json.tool` |
| Database missing | Dual-write failed | Check adapter writes to both JSONL and DB |
| Rebuild fails | JSONL corrupted | Validate JSONL format, check for truncation |
| Silent failures | Missing validation | Add strict parameter validation with ValueError |

---

## Related Instructions

- **See also**: [Validation Essentials](../workflow/validation_essentials.instructions.md) - General validation principles
- **Prerequisites**: [Deterministic Validation Framework](../decision/deterministic_validation_framework.instructions.md) - 100% pass rate requirement
- **Related**: [Observability Patterns](../architecture/observability_patterns.instructions.md) - Comprehensive observability design

---

**Success Criteria**: All 5 validation tests pass, logs isolated correctly, data format verified, storage overhead acceptable

**Confidence Check**: Can you rebuild the database from JSONL and get identical query results? If yes, observability validation is complete.
