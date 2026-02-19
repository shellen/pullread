---
description: Show current state and server health
---

# Pongogo MCP Server Status

Quick health check for Pongogo knowledge routing.

## Instructions

**NOTE**: Do NOT pre-check for MCP tool availability. Simply attempt to call the MCP tools
and report any errors that occur. The tools may be available even if not visible in the
tools list (e.g., in --print mode).

Execute silently and display only the formatted output below.

### Checks to Perform

1. Read `.pongogo-mcp-state.json` for mode
2. (Local dev only) Check `docker ps --filter name=pongogo-` for container status - skip if not applicable
3. Call `get_routing_info` MCP tool to get engine version and instruction count
4. Call `route_instructions` with any test query - only need to know if it returns > 0 results
5. **Event Logging Check**: Call `get_routing_event_stats` MCP tool
   - Returns `status` ("active", "empty", "missing"), `total_count`, `last_event` timestamp
   - Active ✅: status is "active" and last_event is recent
   - Stale ⚠️: status is "active" but last_event is older than 1 hour
   - Failed ❌: status is "missing" or "empty", or tool call fails
   - Do NOT use Bash/sqlite3 to query the database directly — use the MCP tool

### Output Format

```
## Pongogo Status

**Mode**: [ENABLED ✅ | DISABLED ⭕ | SIMULATE 🧪]
**Engine**: [engine version from get_routing_info]
**Preceptor**: [preceptor_version from get_routing_info]
**Instructions**: [instruction_count from get_routing_info]
**Routing**: [Working ✅ | Failed ❌]
**Event Logging**: [Active ✅ | Stale ⚠️ | Failed ❌]
```

If all pass, add:
```
All systems operational.
```

If any fail, show the ❌ status and the relevant fix:

- MCP tool call failed: Check that the MCP server is running and configured in `.mcp.json`
- Routing failed (0 results): Run `pongogo start` to restart, or check container logs with `docker logs pongogo-$(basename $PWD)`
- Event Logging stale/failed: Run `/mcp` to reconnect, then verify with `/pongogo-status`

### Commands Reference

Show only if user asks or if troubleshooting:
- `/pongogo-diagnose` - Deep diagnostics
- `/pongogo-getting-started` - Onboarding guide
- `/pongogo-upgrade` - Update to latest version
