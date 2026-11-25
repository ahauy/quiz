# How to Get Updates — Universal Agents Workflow

This project uses **Universal Agents Workflow** as its AI agent framework.

## Check & Apply Updates

### Option 1 — In your AI Editor (recommended)

Type `/update` in the AI chat:
```
/update
```
The AI will check for a new version and apply it safely using the 3-Way Hash engine.

### Option 2 — CLI

```bash
curl -fsSL https://raw.githubusercontent.com/ahauy/universal-agents-workflow/main/install.sh | bash -s -- --update
```

### Option 3 — Python engine directly

```bash
# Check only (no changes)
python3 .agents/scripts/update-engine.py --check

# Apply update
python3 .agents/scripts/update-engine.py --apply
```

## What Is Protected During Updates?

Your project data is **NEVER overwritten**:

| Protected | Description |
|---|---|
| `CONTEXT.md` | Project ubiquitous language |
| `PRODUCT_BACKLOG_ROADMAP.md` | Product backlog & roadmap |
| `CHANGELOG.md` | Project change history |
| `adr/` | Architecture Decision Records |
| `docs/features/` | Technical documentation |
| `docs/user-guides/` | End-user guides with screenshots |
| `docs/architecture/` | Architecture diagrams & docs |
| `.specify/features/` | Feature specs, test plans, baseline |
| `src/` | Your source code |
| `.env`, `.env.*` | Environment variables & secrets |

User-added custom skills in `.agents/` are also **never deleted**.

## Release Notes

See: <https://github.com/ahauy/universal-agents-workflow/releases>
