---
pongogo_instruction_spec: "0.0.2"
title: "Python Script Development Standards"
description: "Standards for Python script development including structure, testing, and best practices."
applies_to:
  - "**/*"
domains:
  - "software_engineering"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - python_script
      - argparse
      - type_hints
      - pathlib
      - python_logging
      - mypy
      - pytest
      - python_error_handling
      - python_cli
      - python_template
    nlp: "Python script development with type hints, argparse CLI, pathlib file operations, logging module, pytest testing"
evaluation:
  success_signals:
    - All functions have type hints (parameters and return types)
    - argparse used with --help, --debug, --log-level, --dry-run flags
    - Pathlib.Path used for all file operations (not string manipulation)
    - Specific exceptions caught (not bare except clauses)
    - Script structured for testability with main() and __name__ guard
  failure_signals:
    - Functions missing type annotations (mypy errors)
    - sys.argv used directly instead of argparse
    - String path manipulation breaking on Windows
    - Bare except clauses catching KeyboardInterrupt/SystemExit
    - Logic at module level executing on import (not testable)
---


# Python Script Development Standards

**Purpose**: Establish comprehensive standards for developing and maintaining Python scripts with type safety, proper argument parsing, error handling, and systematic prevention patterns.

**Philosophy**: Python scripts should leverage Python's strengths - type hints for clarity, rich standard library for robustness, and testing frameworks for reliability.

---

## When to Apply

Use these Python scripting standards when:

- Writing new Python scripts for project workflows
- Building CLI tools or automation scripts
- Creating data processing or analysis scripts
- Writing migration or maintenance scripts
- Refactoring legacy Python code
- Building scripts that interact with APIs or databases

---

## Quick Reference

**Key Python Script Patterns (Code Examples)**:

**1. Script Template with Safety Flags**:
```python
#!/usr/bin/env python3
"""
script-name.py - Brief description of what this script does

Usage:
    ./script-name.py --dry-run
    ./script-name.py --debug
    ./script-name.py --log-level warn
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)


def setup_logging(log_level: str = "info", debug: bool = False) -> None:
    """Configure logging based on CLI flags."""
    if debug:
        level = logging.DEBUG
    else:
        level = getattr(logging, log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        format='[%(levelname)s] %(message)s'
    )


def main() -> int:
    """Main function. Returns: Exit code (0 = success, 1 = error)."""
    parser = argparse.ArgumentParser(description='Script description')

    parser.add_argument('-d', '--dry-run', action='store_true',
                        help='Show what would be done without making changes')
    parser.add_argument('--debug', action='store_true',
                        help='Show DEBUG messages in terminal')
    parser.add_argument('--log-level', default='info',
                        choices=['info', 'warn', 'error'],
                        help='Set log level (default: info)')

    args = parser.parse_args()
    setup_logging(log_level=args.log_level, debug=args.debug)

    if args.dry_run:
        print("[DRY-RUN MODE] No changes will be made\n")

    logger.debug("Debug message - only shown with --debug")
    logger.info("Info message - shown at info level and above")

    # Main logic here
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

**2. Type Hints for Everything**:
```python
from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path

def process_files(
    file_paths: List[Path],
    output_dir: Path,
    dry_run: bool = False
) -> Tuple[int, int]:
    """
    Process multiple files.

    Args:
        file_paths: List of input file paths
        output_dir: Output directory
        dry_run: If True, don't make changes

    Returns:
        Tuple of (success_count, failure_count)
    """
    success_count = 0
    failure_count = 0

    for file_path in file_paths:
        if process_single_file(file_path, output_dir, dry_run):
            success_count += 1
        else:
            failure_count += 1

    return success_count, failure_count


def parse_config(config_path: Path) -> Optional[Dict[str, Any]]:
    """
    Parse configuration file.

    Returns:
        Config dictionary, or None if parsing failed
    """
    try:
        import yaml
        content = config_path.read_text()
        return yaml.safe_load(content)
    except Exception as e:
        logger.error(f"Failed to parse config: {e}")
        return None
```

**3. Pathlib for File Operations**:
```python
from pathlib import Path

# Pathlib is more Pythonic and cross-platform
file_path = Path("/path/to/file.txt")
directory = file_path.parent
new_path = directory / "new_file.txt"

# Pathlib operations
if file_path.exists():
    content = file_path.read_text(encoding='utf-8')
    file_path.write_text("new content", encoding='utf-8')

# Recursive glob
md_files = list(Path("docs").rglob('*.md'))

# Path components
name = file_path.name           # file.txt
stem = file_path.stem           # file
suffix = file_path.suffix       # .txt
parent = file_path.parent       # /path/to

# Absolute path
abs_path = file_path.resolve()
```

**4. Structured Error Handling**:
```python
from pathlib import Path
from typing import Optional

def read_file_safely(file_path: Path) -> Optional[str]:
    """Read file with comprehensive error handling."""
    try:
        return file_path.read_text(encoding='utf-8')

    except FileNotFoundError:
        logger.error(f"File not found: {file_path}")
        logger.error(f"Current directory: {Path.cwd()}")
        return None

    except PermissionError:
        logger.error(f"Permission denied: {file_path}")
        return None

    except UnicodeDecodeError as e:
        logger.error(f"Encoding error: {e}")
        return None

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        logger.exception("Full traceback:")
        return None
```

**5. Argparse CLI Pattern**:
```python
def main() -> int:
    parser = argparse.ArgumentParser(
        description='Process files with validation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s --dry-run
  %(prog)s --verbose
  %(prog)s --debug --dry-run
        '''
    )

    parser.add_argument('-d', '--dry-run', action='store_true',
                        help='Show what would be done')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Enable verbose logging')
    parser.add_argument('--debug', action='store_true',
                        help='Enable debug mode')
    parser.add_argument('--input-dir', type=Path,
                        default=Path('.'),
                        help='Input directory')

    args = parser.parse_args()
    setup_logging(args.verbose, args.debug)

    if args.dry_run:
        print("[DRY-RUN MODE]\n")

    return 0
```

**6. Structure for Testing**:
```python
#!/usr/bin/env python3
"""analyze-files.py - Analyze file metrics"""

from pathlib import Path
from typing import Dict, List

def count_lines(file_path: Path) -> int:
    """Count lines in file."""
    return len(file_path.read_text().splitlines())

def count_examples(content: str) -> int:
    """Count example blocks."""
    return content.count('```')

def analyze_file(file_path: Path) -> Dict[str, int]:
    """Analyze single file."""
    content = file_path.read_text()
    return {
        'lines': count_lines(file_path),
        'examples': count_examples(content),
        'characters': len(content)
    }

def main() -> int:
    """Main function."""
    directory = Path('docs')
    if not directory.exists():
        print(f"Error: Directory not found: {directory}")
        return 1

    for file_path in directory.rglob('*.md'):
        metrics = analyze_file(file_path)
        print(f"{file_path.name}: {metrics}")

    return 0

if __name__ == '__main__':
    import sys
    sys.exit(main())
```

**7. Type Checking & Linting**:
```bash
# Run type checker
mypy script.py

# Run linter
pylint script.py
# or
ruff check script.py

# Run formatter
black script.py

# Run tests
pytest test_script.py -v
```

---

## Core Principles

- **Type Hints Everywhere**: All functions have type annotations for inputs and outputs
- **Argparse for CLI**: Use argparse (not sys.argv) for command-line argument parsing
- **Validation Before Execution**: Every script implements --dry-run flag
- **Structured Logging**: Use logging module, not print statements
- **Error-Specific Handling**: Catch specific exceptions, not bare `except:`
- **Pathlib for Paths**: Use Path objects, not string manipulation
- **Context Managers**: Use `with` for resources (files, connections, locks)
- **Docstrings Required**: All functions and modules have docstrings
- **Testing First-Class**: Scripts structured for testability with pytest

## Step-by-Step Guidance

### 1. **Start with Script Template**
   - Add shebang: `#!/usr/bin/env python3`
   - Add module docstring describing script purpose
   - Import standard library first, then third-party, then local
   - Expected outcome: Well-structured imports and documentation

### 2. **Implement Argparse with Required Flags**
   - Use argparse.ArgumentParser for all CLI arguments
   - **Required flags** (all scripts must implement):
     - `--help, -h`: Automatically provided by argparse
     - `--debug`: Show DEBUG messages in terminal
     - `--log-level`: Control log verbosity (`info`, `warn`, `error`)
     - `--dry-run, -d`: Show what would be done without making changes
   - Expected outcome: Consistent CLI interface with standard flags

### 3. **Configure Logging**
   - Use logging module instead of print statements
   - Set log level based on --log-level flag; --debug enables DEBUG
   - Use structured log format with timestamps
   - Expected outcome: Configurable, structured logging

### 4. **Add Type Hints**
   - Annotate all function parameters with types
   - Annotate return types (including `-> None`)
   - Use typing module for complex types (List, Dict, Optional)
   - Expected outcome: Type-safe code that passes mypy

### 5. **Implement Error Handling**
   - Catch specific exceptions (IOError, ValueError, etc.)
   - Log errors with context before raising/returning
   - Return exit codes (0 = success, 1+ = error)
   - Expected outcome: Clear error messages with recovery guidance

### 6. **Use Pathlib for File Operations**
   - Import Path from pathlib
   - Use Path objects for all file paths
   - Use Path methods (exists(), read_text(), etc.)
   - Expected outcome: Cross-platform path handling

### 7. **Structure for Testability**
   - Logic in functions, not at module level
   - Main logic in main() function
   - Use `if __name__ == '__main__'` guard
   - Expected outcome: Functions can be imported and tested

## Validation Checklist

Before considering a Python script complete:

- [ ] Shebang present: `#!/usr/bin/env python3`
- [ ] Module docstring describing purpose
- [ ] All functions have type hints
- [ ] All functions have docstrings
- [ ] Argparse used for CLI arguments
- [ ] **Required CLI flags implemented**:
  - [ ] `--help, -h` (automatic with argparse)
  - [ ] `--debug` (show DEBUG messages)
  - [ ] `--log-level` (`info`, `warn`, `error`)
  - [ ] `--dry-run, -d` (for scripts that modify data)
- [ ] Logging module used (not print statements)
- [ ] Specific exception handling (not bare `except:`)
- [ ] Pathlib used for all file paths
- [ ] `if __name__ == '__main__'` guard present
- [ ] Main logic in `main()` function returning exit code
- [ ] Script tested with `--dry-run` and `--help`
- [ ] mypy passes with no type errors
- [ ] pytest tests written for core functions

## Common Pitfalls

### Pitfall 1: Bare `except:` Clauses

- **Problem**: Catches all exceptions including KeyboardInterrupt, SystemExit
- **Why it happens**: Lazy exception handling
- **Solution**: Catch specific exceptions (IOError, ValueError, etc.)

### Pitfall 2: Using `sys.argv` Instead of argparse

- **Problem**: Manual argument parsing is error-prone, no `--help` generation
- **Why it happens**: Thinking argparse is overkill for simple scripts
- **Solution**: Always use argparse, even for simple scripts

### Pitfall 3: String Path Manipulation

- **Problem**: Path joining with `+` or `/` breaks on Windows
- **Why it happens**: Not using pathlib
- **Solution**: Use Path objects for all file paths

### Pitfall 4: Missing Type Hints

- **Problem**: Functions unclear, type errors not caught
- **Why it happens**: Treating Python as dynamically typed
- **Solution**: Add type hints to all functions

### Pitfall 5: Logic at Module Level

- **Problem**: Script runs immediately on import, can't test functions
- **Why it happens**: Not using `if __name__ == '__main__'` guard
- **Solution**: Put logic in functions, call from `main()`, use guard

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| mypy type errors | Missing or incorrect type hints | Add type annotations, import from typing module |
| Script runs on import | No `if __name__ == '__main__'` guard | Add guard around main() call |
| Path errors on Windows | String path manipulation | Use pathlib.Path for all paths |
| Can't interrupt script | Bare `except:` catches KeyboardInterrupt | Catch specific exceptions only |
| No --help output | Not using argparse | Replace sys.argv with argparse |
| Encoding errors | Not specifying encoding | Use `encoding='utf-8'` in file operations |

---

**Success Criteria**: All Python scripts use type hints, argparse, logging module, pathlib, implement safety flags, and have pytest tests. mypy passes with no errors.
