# Codex subagent configuration

These project-local adapters configure the 13 UAW roles for Codex. Each TOML
file in `agents/` defines a model, reasoning effort, and a pointer to the canonical
role in `.agents/agents/`. The portable role files retain `model: inherit`.

| Roles | Model | Reasoning effort |
| --- | --- | --- |
| business-analyst, system-architect, code-reviewer, ui-ux-reviewer, agent-evaluator | `gpt-6.2-sol` | `high` |
| backend-developer, frontend-developer, slice-implementer, tech-doc-architect | `gpt-6-luna` | `high` |
| code-explorer, build-resolver, e2e-runner, user-guide-creator | `gpt-6-luna` | `medium` |

This assignment was approved on 2026-11-26: lower each previous model tier by one,
keep Luna at the lowest tier, and retain the previously proposed reasoning efforts.

Open a new Codex chat rooted at this project to load the agent definitions.
Use these role names when requesting a subagent. The agent file settings take
precedence over inherited model and reasoning settings.

WorkBuddy remains configured independently in `.agents/models/profiles.json`.
The upstream UAW `sync-harnesses.mjs` does not generate Codex adapters; update
these TOML model settings directly when changing the Codex assignment. Role
instructions continue to come from the canonical Markdown files after UAW updates.

Reference: [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents).

## Local framework prerequisite

The native adapters require a local UAW installation providing `AGENTS.md` and
`.agents/agents/`. Those workflow files are intentionally ignored by this repository
and are not included in a clone. Restore them through the UAW installer before
using these adapters. Application builds do not require these local workflow files.
