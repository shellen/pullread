# Pongogo Configuration

View and edit Pongogo preferences for trigger behaviors and communication style.

## Usage

### View All Preferences

```
/pongogo-config
```

Shows current preference settings for all triggers and communication options.

### Set Behavior Preference

```
/pongogo-config <trigger> <mode>
```

Set how Pongogo handles a specific trigger:
- `auto` - Execute automatically
- `ask` - Prompt before action
- `skip` - Don't execute or mention

**Examples**:
```
/pongogo-config work_log auto
/pongogo-config retro ask
/pongogo-config issue_closure skip
```

### Available Triggers

| Trigger | Description |
|---------|-------------|
| `work_log` | Work log entry on task completion |
| `retro` | Retrospective on task/epic completion |
| `pi_threshold` | PI system threshold prompts |
| `issue_commencement` | Issue start checklist |
| `issue_closure` | Issue completion checklist |
| `rca` | Root cause analysis on incidents |
| `decision_capture` | Capture key decisions |

### Set Communication Preference

```
/pongogo-config communication <setting> <value>
```

**Examples**:
```
/pongogo-config communication verbosity concise
/pongogo-config communication tone casual
/pongogo-config communication acronyms false
```

### Reset Preferences

```
/pongogo-config reset
```

Clears all learned preferences, returning to defaults.

```
/pongogo-config reset <trigger>
```

Reset a specific trigger to unlearned state.

---

## Execution

When this command is invoked:

1. **Parse arguments** to determine action (view, set, reset)

2. **Read current preferences** from `.pongogo/preferences.yaml`

3. **For view**: Display current settings in a formatted table

4. **For set**:
   - Update the specified preference
   - Save to `.pongogo/preferences.yaml`
   - Confirm the change

5. **For reset**:
   - Clear specified preferences (or all)
   - Save to `.pongogo/preferences.yaml`
   - Confirm the reset

---

## Output Format

### View All

```markdown
## Pongogo Preferences

### Behavior Modes

| Trigger | Mode | Learned |
|---------|------|---------|
| work_log | auto | 2025-12-20 |
| retro | ask | 2025-12-20 |
| pi_threshold | (not set) | - |
| issue_closure | auto | 2025-12-19 |

### Communication

| Setting | Value |
|---------|-------|
| Verbosity | balanced |
| Tone | professional |
| Acronyms | true |
| Emojis | false |

### Committed Approaches

| Problem Type | Technique | Uses |
|--------------|-----------|------|
| Root Cause Analysis | 5 Whys | 4 |
```

### Set Confirmation

```markdown
Updated preference:
- **work_log**: ask → auto

This will take effect immediately.
```

### Reset Confirmation

```markdown
Reset preferences:
- work_log: cleared (was: auto)
- retro: cleared (was: ask)

Pongogo will ask about these behaviors on next occurrence.
```

---

## Related

- Design doc: `docs/design/preferences-system.md`
- Foundational instruction: `knowledge/instructions/_pongogo_core/_pongogo_collaboration.instructions.md`
- Preferences file: `.pongogo/preferences.yaml`
