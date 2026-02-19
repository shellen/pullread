---
description: Contact Pongogo support with diagnostic info
---

# Pongogo Contact

Get help from Pongogo support with pre-filled diagnostic information.

## Usage

```
/pongogo-contact                 # General inquiry
/pongogo-contact issue           # Report a problem (includes diagnostics)
/pongogo-contact feature         # Request a feature
/pongogo-contact feedback        # General feedback
```

## Execution

### Step 1: Determine Contact Type

Based on argument or ask user:

| Type | Subject Prefix | Include Diagnostics |
|------|----------------|---------------------|
| `issue` | [Issue] | Yes - full diagnostics |
| `feature` | [Feature Request] | No |
| `feedback` | [Feedback] | No |
| (none) | [Inquiry] | Optional |

### Step 2: Gather Information

**For issue reports**, run diagnostics silently:

```bash
# Get OS and architecture
OS=$(uname -s -m)

# Get Docker version
DOCKER=$(docker --version 2>/dev/null | head -1 || echo "not installed")

# Get Pongogo version (from config or container)
VERSION=$(grep -m1 "version:" .pongogo/config.yaml 2>/dev/null || echo "unknown")

# Count instructions
INSTRUCTIONS=$(find .pongogo/instructions -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

# Container status
CONTAINER=$(docker ps --filter "ancestor=pongogo.azurecr.io/pongogo" --format "{{.Status}}" 2>/dev/null | head -1 || echo "not running")
```

### Step 3: Generate Email Link

Build mailto URL with pre-filled content:

**For issue reports**:
```
Subject: [Issue] Brief description of problem

Body:
## Issue Description

[User describes issue here]

## Steps to Reproduce

1.
2.
3.

## Expected Behavior



## Actual Behavior



---
## Diagnostic Info (auto-generated)

- OS: {OS}
- Docker: {DOCKER}
- Pongogo Version: {VERSION}
- Instructions: {INSTRUCTIONS} files
- Container: {CONTAINER}
- Config: .pongogo/ exists: yes/no
- MCP Config: .mcp.json exists: yes/no
```

**For feature requests**:
```
Subject: [Feature Request] Brief description

Body:
## Feature Description

[Describe the feature you'd like]

## Use Case

[Why do you need this feature?]

## Proposed Solution (optional)

[Any ideas for how this could work?]
```

**For feedback**:
```
Subject: [Feedback] Brief description

Body:
## Feedback

[Your feedback here]

## Context (optional)

[How are you using Pongogo?]
```

### Step 4: Present to User

Show the pre-filled content and provide the mailto link:

```markdown
## Contact Pongogo Support

I've prepared a support email for you. Here's what will be sent:

---

**To**: support@pongogo.com
**Subject**: [Issue]

**Body**:
[Show the pre-filled body content]

---

### Send Options

1. **Click to open email client**:
   [Open Email](mailto:support@pongogo.com?subject=...)

2. **Copy and paste** (if mailto doesn't work):
   - Email: support@pongogo.com
   - Subject: [copy from above]
   - Body: [copy from above]

---

**Edit the placeholders** in brackets before sending!
```

### Mailto URL Encoding

Properly encode the mailto URL:

```python
import urllib.parse

subject = "[Issue] Brief description"
body = """## Issue Description

[Describe your issue here]

---
## Diagnostic Info
- OS: macOS arm64
- Docker: Docker version 24.0.7
"""

mailto = f"mailto:support@pongogo.com?subject={urllib.parse.quote(subject)}&body={urllib.parse.quote(body)}"
```

### Privacy Note

For issue reports, remind user:

```
**Privacy**: The diagnostic info above contains only:
- System info (OS, Docker version)
- File counts and paths
- Container status

It does NOT include:
- File contents
- Personal data
- API keys or secrets

You can remove any info you prefer not to share before sending.
```
