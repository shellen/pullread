---
description: Upgrade Pongogo to latest version
---

# Pongogo Upgrade

Upgrade Pongogo to the latest version.

## Usage

```
/pongogo-upgrade
```

## Execution

**Use the MCP tool to get upgrade instructions.**

1. Call the `upgrade_pongogo()` MCP tool (from pongogo-knowledge server)
2. Display the `message` from the response
3. Show the `upgrade_command` for the user to copy

## Output

Display the result from the MCP tool:

```
## Pongogo Upgrade

**Current Version**: [current_version from response]

**Upgrade Command**:
```bash
[upgrade_command from response]
```

**After running the command**:
1. Exit Claude Code
2. Re-enter Claude Code
3. Run `/mcp` to verify Pongogo is connected
```

If the MCP tool fails, suggest:
```
Could not get upgrade info. Try manually:

```bash
docker pull pongogo.azurecr.io/pongogo:stable
```

Then restart Claude Code.
```
