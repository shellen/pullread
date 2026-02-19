---
description: Interactive onboarding and command reference
---

# Pongogo Getting Started

Interactive guide for new users and quick command reference.

## Usage

```
/pongogo-getting-started        # Full interactive guide
/pongogo-getting-started quick  # Just show commands
```

## Execution

**Execute checks silently and display only the formatted welcome and command reference.**

### First-Time User Detection

Check if this appears to be a new user:
- Does `.pongogo/` exist? If not, suggest `pongogo init`
- Has routing been tested? Check for recent successful routes

### Interactive Welcome

For new users, present this welcome:

```
## Welcome to Pongogo! 🎾

Pongogo is your AI knowledge routing system. It helps Claude find the right
guidance for your project automatically.

### What Just Happened

When you ran `pongogo init`, we:
1. Created `.pongogo/` with configuration and instruction files
2. Set up the MCP server connection in `.mcp.json`
3. Installed slash commands (like this one!)

### How It Works

As you work, Pongogo automatically routes relevant instructions to Claude:
- Ask about commits → gets git safety and commit format guidance
- Working on tests → gets testing standards
- Managing issues → gets GitHub workflow guidance

You don't need to do anything - it happens automatically in the background.
```

### Quick Start Checklist

Present interactive checklist:

```
### Quick Start Checklist

Let's make sure everything is working:

1. **Verify MCP Connection**
   Run `/mcp` and look for `pongogo-knowledge` ✓

2. **Test Routing**
   Ask me: "How should I format commit messages?"
   (You should see relevant guidance appear)

3. **Check Status**
   Run `/pongogo-status` for system health

All good? You're ready to go! Pongogo works in the background automatically.
```

### Command Reference

Always show the command reference:

```
### Available Commands

| Command | What It Does |
|---------|--------------|
| `/pongogo-status` | Quick health check - is everything working? |
| `/pongogo-diagnose` | Deep diagnostics - for troubleshooting |
| `/pongogo-contact` | Contact support with diagnostic info |
| `/pongogo-config` | Edit your preferences |
| `/pongogo-add-work-log-entry` | Create a work log entry |
| `/pongogo-conduct-retro` | Run a retrospective/learning loop |
| `/pongogo-complete-issue` | Completion checklist for finishing work |
| `/pongogo-perform-rca` | Root cause analysis wizard |
| `/pongogo-recent-progress` | Summary of recent accomplishments |
| `/pongogo-upgrade` | Update to latest Pongogo version |
| `/pongogo-getting-started` | This guide |

### Tips

- **Pongogo is automatic** - you don't need to invoke it manually
- **Instructions evolve** - they improve based on your project's patterns
- **Check status anytime** - `/pongogo-status` for quick health check
- **Problems?** - `/pongogo-diagnose` generates a support bundle
```

### Contextual Help

If user asks about specific topic, provide targeted guidance:

**If asked about routing**:
```
### How Routing Works

When you send a message, Pongogo analyzes it and finds relevant instructions:

1. Your message: "How do I safely force push?"
2. Pongogo matches: git_safety.instructions.md, commit_format.instructions.md
3. Claude receives: Your message + relevant guidance

This happens automatically - no action needed from you.
```

**If asked about instructions**:
```
### Your Instruction Files

Instructions live in `.pongogo/instructions/` organized by category:

- `software_engineering/` - Coding standards, commit formats
- `safety_prevention/` - Git safety, validation patterns
- `project_management/` - Work logging, issue tracking
- `quality/` - Testing, PR workflows
- ... and more

These are seeded defaults. Over time, you can customize them for your project.
```

**If asked about customization**:
```
### Customizing Pongogo

1. **Edit preferences**: `/pongogo-config`
2. **Modify instructions**: Edit files in `.pongogo/instructions/`
3. **Add project-specific guidance**: Create new `.md` files in instructions

Pongogo learns from your project's wiki/ and docs/ folders too.
```

### Troubleshooting Quick Links

```
### Need Help?

- **Something broken?** → `/pongogo-diagnose`
- **Not seeing routing?** → Check `/mcp` for connection
- **Want to reset?** → `pongogo init --force`
- **Contact support** → `/pongogo-contact`
- **Report an issue** → https://github.com/pongogo/pongogo/issues
- **Learn more** → https://pongogo.com
```
