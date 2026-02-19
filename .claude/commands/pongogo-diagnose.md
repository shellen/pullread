---
description: Run comprehensive diagnostics for troubleshooting
---

# Pongogo Diagnose

Run comprehensive diagnostics to verify Pongogo installation and generate a support bundle.

## Usage

```
/pongogo-diagnose           # Full diagnostics
/pongogo-diagnose --brief   # Quick check only
```

## Execution

**IMPORTANT: Run all diagnostic checks QUIETLY and display ONLY the final formatted diagnostic report.**

- Do NOT show intermediate output, progress messages, or thinking aloud
- Do NOT display individual tool call results to the user
- Suppress all user-facing messaging during data gathering
- Execute each check silently, then aggregate results into the final report
- The user should see ONLY the formatted "## Pongogo Diagnostic Report" output below

**CRITICAL: Use MCP tools directly - do NOT parse cached files**

- Call MCP tools (e.g., `route_instructions()`, `get_health_status()`) and use the response directly
- Do NOT use `jq`, `cat`, or bash to read files from `.claude/projects/*/tool-results/`
- Do NOT try to parse cached MCP tool result files - they may be in unexpected formats
- Extract values directly from the MCP tool response object (e.g., `response.count`, `response.guidance_action`)

Run all diagnostic checks and generate a formatted report. This report can be shared with support.

### Diagnostic Checks

#### 1. Environment Info
Gather system context (safe to share, no secrets):

```bash
# OS and architecture
uname -s -m

# Docker version
docker --version 2>/dev/null || echo "Docker not found"
```

#### 2. Configuration Validation

Check `.pongogo/` directory:
- [ ] `.pongogo/config.yaml` exists and is valid YAML
- [ ] `.pongogo/instructions/` directory exists
- [ ] Count instruction files: `find .pongogo/instructions -name "*.md" | wc -l`
- [ ] Count categories: `ls -d .pongogo/instructions/*/ | wc -l`

Check `.mcp.json`:
- [ ] File exists at project root
- [ ] Contains `pongogo-knowledge` server entry
- [ ] Docker command path is valid

#### 3. MCP Server Connection & Health

Use MCP tools to verify connection and get comprehensive health status:

**Get comprehensive health status** (recommended):
- Call `get_health_status()` via MCP
- This returns all component statuses in one call:
  - `overall`: "healthy" | "degraded" | "unhealthy"
  - `container`: Container status
  - `database`: Events database health
  - `events`: Event capture activity
  - `config`: Configuration validity

**Get routing engine version (MCP server)**:
- Call `get_routing_info()` via MCP
- Extract `engine` from response (e.g., "durian-0.6.5")
- Extract `preceptor_version` from response (e.g., "0.1.0")
- This is the version running in the Docker container

**Get routing engine version (CLI/pongogo wrapper)**:
- For container-based installations (standard): Run via Bash: `pongogo version --engine 2>/dev/null || echo "unknown"`
- Fallback for pip installations: `python -c "from mcp_server.pongogo_router import DURIAN_VERSION; print(DURIAN_VERSION)" 2>/dev/null`
- This is the version used by the CLI wrapper
- **Compare CLI vs MCP versions** - they should match
- If versions differ, it indicates the Docker container is stale or the pip package needs updating

**Get pongogo package version and check for updates**:
- Call `check_for_updates()` via MCP
- Extract `display_version`, `current_version`, and `latest_version` from response
- Use `display_version` for user-facing version display (formatted with channel)
- Note if `update_available` is true

**Test routing**:
- [ ] Call `route_instructions` with test query "how do I commit code?" and `diagnostic_mode=True`
- [ ] Verify returns > 0 results
- [ ] Record response time
- Note: `diagnostic_mode=True` prevents test queries from polluting event history

#### 4. Event History

Check routing event capture health using `get_routing_event_stats()` MCP tool:

- [ ] Call `get_routing_event_stats()` via MCP
- [ ] Check `status` field: "active", "empty", or "missing"
- [ ] Note `total_count` for total events captured
- [ ] Note `last_event` timestamp and calculate relative time
- [ ] Note `last_24h_count` for recent activity

**Status Interpretation**:
- **active**: Database exists with events - healthy state
- **empty**: Database exists but no events yet - recently initialized
- **missing**: No database file - `pongogo init` may not have been run

#### 5. Routing Validation

Test routing with known queries that should return results.
**IMPORTANT**: Use `diagnostic_mode=True` for all test queries to exclude them from event history.

| Test Query | Expected Category | Pass/Fail |
|------------|-------------------|-----------|
| "how do I commit code?" | software_engineering | |

Call: `route_instructions("how do I commit code?", diagnostic_mode=True)`

#### 6. Guidance Detection

Test that user guidance is properly detected and `guidance_action` is emitted.

**Test query**: "Always double-check your work"

- [ ] Call `route_instructions` with the test query and `diagnostic_mode=True`
- [ ] Check if `guidance_action` is present in response
- [ ] Check if `routing_analysis.guidance_pre_check` is `true`
- [ ] Note the signals detected

**Expected result**:
- `guidance_action.action` = "log_user_guidance"
- `guidance_action.parameters.guidance_type` = "explicit"
- `guidance_action.signals` contains pattern match

**If guidance_action is missing**:
- Check router version is `durian-0.6.4` or later
- Check feature flags: `guidance_pre_check: true`, `guidance_action: true`
- Check lexicon DB is loaded (look for "Lexicon DB loaded" in server logs)

#### 7. Network Connectivity (if MCP connection fails)

```bash
# Can reach container registry (run on HOST via Bash tool)
curl -s -o /dev/null -w "%{http_code}" https://pongogo.azurecr.io/v2/ 2>/dev/null
```

### Output Format

Generate a copyable diagnostic report:

```markdown
## Pongogo Diagnostic Report

**Generated**: [timestamp]
**Pongogo Version**: [display_version from check_for_updates]
**Latest Version**: [latest_version from check_for_updates] [⚠️ Update available if update_available=true]
**Routing Engine (MCP)**: [from get_routing_info MCP tool, e.g., durian-0.6.5]
**Routing Engine (CLI)**: [from `pongogo version --engine`, e.g., durian-0.6.5] [⚠️ VERSION MISMATCH if different from MCP]
**Preceptor**: [preceptor_version from get_routing_info response]

### Environment
- **OS**: [uname output]
- **Docker**: [version or "not found"]
- **Architecture**: [arm64/amd64]

### Configuration
- **Config file**: ✅ Valid / ❌ Missing / ⚠️ Invalid
- **Instructions**: [instruction_count] files ([seeded_count] seeded + [core_count] core)
- **MCP config**: ✅ Valid / ❌ Missing / ⚠️ Invalid

### MCP Server
- **Status**: ✅ Connected / ❌ Not connected
- **Version**: [display_version] → [latest_version] [✅ Up to date / ⚠️ Update available]

### Event History
- **Status**: ✅ Active / ⚠️ Empty / ❌ Missing
- **Total Events**: [count]
- **Last Event**: [timestamp] ([relative time, e.g., "2 hours ago"])
- **24h Activity**: [count] events

### Routing Tests
| Query | Result | Time |
|-------|--------|------|
| commit code | ✅ 3 matches | 45ms |

### Guidance Detection
- **Test Query**: "Always double-check your work"
- **guidance_action**: ✅ Present / ❌ Missing
- **Pre-check**: ✅ Enabled / ❌ Disabled
- **Signals**: [list of detected signals, e.g., "guideline_001"]

### Overall Status
[✅ All systems operational / ⚠️ Issues detected / ❌ Critical failure]

### Issues Found
[ONLY include this section if there ARE issues detected]
[If all checks passed, SKIP this section entirely - do not show "Issues Found" with "None detected"]
[List any actual problems detected here]

### Recommended Actions
[ONLY include this section if there are issues to fix]
[Specific fix commands if issues found]
[If update_available: "Run `[upgrade_command]` then restart Claude Code"]
```

### Support Integration

If issues are found, offer support options:

```
Issues detected. To get help:

1. Run `/pongogo-contact issue` to generate a support email with diagnostics

2. Or email directly: [support@pongogo.com](mailto:support@pongogo.com?subject=%5BIssue%5D%20Pongogo%20Diagnostic%20Failure&body=Please%20paste%20the%20diagnostic%20report%20above%20and%20describe%20your%20issue.)
```

### Quick Fixes Reference

| Issue | Fix |
|-------|-----|
| MCP not connected | Restart Claude Code, allow MCP server when prompted |
| Router version mismatch | Restart Claude Code to reload MCP server with correct container version |
| Image not found | `pongogo upgrade` or `docker pull pongogo.azurecr.io/pongogo:stable` |
| Config invalid | `pongogo init --force` |
| No instructions | `pongogo init` |
| Routing returns 0 | Check `.pongogo/instructions/` exists and has `.md` files |
| Event history missing | Database auto-creates on first route call |
| Event history empty | Normal for new installs; events captured on first route call |
| guidance_action missing | Requires durian-0.6.4+; check `guidance_pre_check` feature is enabled |
| Guidance not detected | Check lexicon.db is loaded; verify guideline patterns exist |

**NOTE**: Pongogo runs via Claude Code's MCP infrastructure. Do NOT suggest `docker-compose` commands - they don't apply here.

### Privacy Note

The diagnostic report contains:
- ✅ System info (OS, Docker version)
- ✅ File counts and paths
- ✅ Routing test results
- ❌ NO file contents
- ❌ NO personal data
- ❌ NO API keys or secrets
