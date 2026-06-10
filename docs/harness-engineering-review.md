# Harness Engineering Review — fabric-skills-settings

| | |
|---|---|
| **Date / time of analysis** | 2026-06-10, 21:21 UTC |
| **Model used** | `claude-fable-5` (Claude Code, remote execution environment) |
| **Scope** | Agent-harness assets: root `CLAUDE.md` / `AGENTS.md`, profile entrypoints (`cli/profiles/{claude,codex}/`), subagents, `settings.local.json` / `config.toml`, hooks, knowledge-graph content (`server/content/`), skills (`server/skills/`), and the pytest validators that enforce them (`tests/_validation/`, `tests/test_*`) |
| **Verification performed** | `uv run --group dev pytest tests/test_agent_guidance.py tests/test_install_package.py tests/test_profile_entrypoints.py` — 9 passed |

---

## Executive summary

This repository contains some of the most deliberate harness engineering I have reviewed: prompt invariants are codified as pytest validators, profile entrypoints are budgeted to ≤ 50 lines and verified for cross-vendor parity, and operational knowledge is moved out of static context files into a server-side knowledge graph with runtime-writable memory. That architecture is sound and ahead of common practice.

The weaknesses are mostly in the gap between **what the prose mandates and what the harness mechanically enforces or permits**:

1. The Claude subagents' `tools:` frontmatter restricts them to built-in tools only — excluding the MCP graph tools their own prompts make mandatory (highest-impact finding).
2. The hub-and-spoke orchestrator pattern is unenforceable in Claude Code as installed (subagents cannot invoke sibling subagents).
3. MCP tool/server naming is inconsistent across the harness (`fabric-server`, `fabric_server`, `fabric-graph`, `mcp__fabric_server__.` with a stray dot), which directly causes failed tool calls.
4. Tests run only on release, not on PR/push, so the excellent validators don't gate merges.
5. Several graph-content nodes contain stale or self-contradictory text that the validators don't catch (skills-index claims skills live at `.claude/skills/`; rtk node references gate probes that no longer exist).

Details and concrete fixes below.

---

## What is good

### 1. Prompt invariants enforced as code (standout practice)

`tests/_validation/agent_guidance.py` turns the harness contract into regression tests:

- **Line budget**: profile entrypoints must stay ≤ 50 lines (`PROFILE_MAX_LINES`), preventing the universal failure mode of CLAUDE.md files growing until the model stops following them.
- **Anti-drift anchor**: the sentence *"You know NOTHING about this project except how to call the graph tool"* is asserted verbatim (`PROFILE_ANCHOR`), so the graph-first posture can't be silently edited away.
- **Forbidden section headings** (`## Pipeline Structure`, `## Operating Rules`, …) mechanically prevent operational content from leaking back into the entrypoints.
- **Skill wiring checks** assert that developer/tester agents reference the skills they own, and that the skills-index lists every installed skill.
- **Negative permission checks**: the validator fails if `settings.local.json` ever allowlists `Bash(fab *)` or `Bash(rtk *)` — encoding a security decision as a test.

This is "prompts as tested artifacts" rather than "prompts as prose", and it is the single strongest aspect of the project.

### 2. Cross-vendor parity with tolerated divergence

`tests/test_profile_entrypoints.py` normalizes vendor-specific tokens (`Codex`/`Claude Code` → `AGENT_RUNTIME`, skill paths → `SKILLS_PATH`) and asserts ≥ 80 % similarity plus identical `##` heading layout between the Claude and Codex profiles, and again between root `CLAUDE.md` and `AGENTS.md`. This catches the common failure where one vendor's guidance is updated and the other rots — without forcing byte-identical files.

### 3. Graph-first progressive disclosure

Moving all operational knowledge (setup gate, operating rules, workflows, skills, per-topic memory) behind `graph_get_entry` → `graph_get_linked` traversal is a genuinely good design:

- The static context cost per session is ~50 lines instead of hundreds.
- Knowledge is **single-sourced** across Claude and Codex (one graph serves both).
- Memory is **runtime-writable** (`graph_create_node` kind `memory`, `skill-fix` nodes with a mandated post-mortem structure: `## What happened` / `## Root cause` / `## Fix applied` / `## Rule going forward`). The skill-fix convention in `developer.md` is an excellent institutional-memory pattern.
- Anti-hallucination rule ("only navigate to node ids returned by graph tools, never guess") plus a citation requirement ("cite the node ids you sourced from") gives provenance for agent claims.

### 4. The setup gate is written to be checkable

`server/content/entry.md` defines pass/fail conditions per check, a verbatim refusal string ("Setup incomplete. …"), an explicit "do not attempt workarounds" instruction, and a session-scoped confirmation rule for the active workspace. Exact-response gates are far easier to audit in transcripts than vague "make sure setup is done" guidance.

### 5. Security posture is layered, not just prose

- `settings.local.json` **deny** rules block reading `.env*`, `*secret*`, `*credential*`, `*token*`, and graph backing files — a harness-level guarantee independent of model compliance.
- Operator subagent gets `Read/Bash/Glob/Grep` but no `Write`/`Edit` — tool-level least privilege matching its "never modify" charter.
- Privacy rules (never echo workspace IDs, refer by `displayName` only) and the SBOM-as-graph-node (`memory/sbom`, checked against osv.dev per SEC-12) are unusually thorough for an agent pack.
- The OWASP-mapped operator checklist (`operator.md`) is concrete and greppable (e.g. "no `spark.sql(f"…")`"), not aspirational.

### 6. Context lifecycle management

`operating-rules.md` instructs agents to tell the user to `/clear` on topic switches and `/compact` before high-redesign changes, and the `SessionStart` hooks (both profiles) inject a fresh-session reminder ("no prior context… call graph_get_entry first"). Very few projects manage context window hygiene explicitly; this one does.

### 7. Sensible runtime tuning

`settings.local.json` sets effort level, 1-hour prompt caching, raised Bash timeouts, and pre-approves exactly the read-only commands and MCP tools an agent needs — reducing permission-prompt fatigue without opening `Bash(*)`. The Codex `config.toml` mirrors this with `approval_mode = "approve"` for the four read-only graph tools and bounds agent threads (`max_threads = 6`, `max_depth = 1`).

### 8. Skill design

Skill descriptions carry explicit trigger phrases ("Use when loading data from…", "auto-triggers when token efficiency is requested"), long skills are split into graph-discoverable `sections/` with a reachability test (≤ 2 hops from skills-index), and the `caveman` skill includes an explicit persistence clause ("ACTIVE EVERY RESPONSE… Off only: 'stop caveman'") — anticipating instruction-decay over long sessions.

---

## What needs improvement

Ordered by impact. Each item: what's wrong → why it matters → how I would fix it.

### HIGH-1 · Claude subagents cannot call the MCP tools their prompts mandate

**What**: All four agents in `cli/profiles/claude/agents/*.md` declare a `tools:` list of built-ins only (e.g. `developer.md`: `Read, Write, Edit, Bash, Glob, Grep`). In Claude Code, when `tools` is specified the subagent is restricted to *exactly* those tools; omitting it inherits all tools including MCP. Yet every agent prompt makes graph MCP calls mandatory — developer must `graph_create_node` for SBOM and skill-fixes, tester must `graph_get_node('skills/fabric-validate')`, orchestrator must call `graph_get_entry` first.

**Why it matters**: As installed, the subagents will fail (or silently skip) the exact behaviors the harness is built around — the setup gate, graph memory, skill fetching. The whole graph-first architecture is inert inside subagents.

**How to fix**: Either remove the `tools:` key so agents inherit the full tool surface (simplest, but loses least-privilege for operator), or explicitly enumerate the MCP tools each agent needs, e.g. for developer:

```yaml
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__fabric-server__graph_get_entry
  - mcp__fabric-server__graph_get_node
  - mcp__fabric-server__graph_get_linked
  - mcp__fabric-server__graph_search
  - mcp__fabric-server__graph_create_node
  - mcp__fabric-server__graph_update_node
  - mcp__fabric-server__graph_add_edge
  - mcp__fabric-server__pipeline_lineage_check
  - mcp__fabric-server__data_mock_generate
  - mcp__fabric-server__semantic_model_show
```

Then add a validator check (in `agent_guidance.py`) asserting that every `graph_*` tool an agent's body references appears in its `tools:` list — closing this class of bug permanently, in the same spirit as the existing skill-wiring check.

### HIGH-2 · The orchestrator routing model is not executable in Claude Code

**What**: `orchestrator.md` is installed as a subagent and instructed to "route to developer, tester, or operator" with all agents reporting back to it. In Claude Code, subagents cannot spawn or message other subagents — only the main thread can invoke agents. The hub-and-spoke state machine (developer → tester on complete, FAIL → human approval before retry, operator APPROVED → tester, …) exists only as prose inside an agent that mechanically cannot do any of it.

**Why it matters**: The most carefully designed part of the multi-agent flow — including its safety property "never auto-retry on FAIL, ask the human" — has no execution path. In practice the main thread will improvise routing based on agent `description` fields alone.

**How to fix**: Move the routing rules to where the router actually runs — the main thread. Two options:

1. Promote the routing table into a graph node (e.g. `graph-content/session/agent-routing`) linked from `session-start`, so the main agent reads it as part of the mandatory traversal, and demote `orchestrator.md` to a scoping/clarification agent (which is the part a subagent *can* do).
2. If genuine programmatic orchestration is wanted, enforce the state machine in harness code (a `fabric-vibe` command or hook that tracks task state), not in prompts.

Note the same design *does* work in Codex (`config.toml` has `[agents] max_depth = 1` thread support), so this is a per-vendor divergence the parity tests can't see — worth a vendor-specific note in each profile.

### HIGH-3 · MCP server/tool naming is inconsistent across the harness

**What**: Four spellings coexist:

- `settings.local.json` allowlists `mcp__fabric-server__graph_get_entry` (hyphen).
- Both profile entrypoints say the tool is exposed as `mcp__fabric_server__.graph_get_entry` — underscore **and a stray dot** that matches no client's naming scheme. The Claude profile also retained the Codex-specific sentence verbatim ("In Codex this is exposed as…").
- `server/content/session/session-start.md` references `mcp__fabric_graph__.graph_get_entry` and "the equivalent `fabric-graph` MCP tool names" — a server name that doesn't exist anywhere else (`config.toml` and the compose stack call it `fabric_server`/`fabric-server`).

**Why it matters**: Agents are told to call tools by names that don't resolve. Models often recover, but on the mandatory first action of every session ("call `graph_get_entry` first") you want zero ambiguity — a failed first tool call costs a retry loop at minimum and gate-skipping at worst.

**How to fix**: Pick the canonical names per vendor (Claude: `mcp__fabric-server__<tool>`; Codex: `mcp__fabric_server__<tool>`), fix `session-start.md` (`fabric_graph` → `fabric_server`), remove the stray dot, and make each profile state only its own vendor's spelling. Then add a validator: grep all profile + graph-content files for `mcp__` tokens and assert they match the canonical set. This is exactly the kind of string-level invariant the existing validator framework handles well.

### HIGH-4 · Tests and validators don't gate PRs

**What**: `.github/workflows/` contains only `docker-publish.yml` and `python-publish.yml`; pytest runs only in the release workflow. There is no CI on `push`/`pull_request`.

**Why it matters**: The project's defining strength — invariant validators — only fires at release time. A PR can merge with a 90-line profile, a broken skills-index, or a forbidden `Bash(fab *)` allowlist entry, and nothing complains until the next release. For a repo where agents themselves author many PRs, merge-time gating is the whole point.

**How to fix**: Add a `ci.yml`:

```yaml
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: astral-sh/setup-uv@v5
        with: { enable-cache: true }
      - run: uv sync --group dev --all-extras
      - run: uv run --group dev pytest
      - run: uv build   # wheel-content check, same as release
```

Then make it a required status check on `main`.

### MED-1 · Graph content contradicts the architecture in places (validators check phrases, not truth)

**What**: Three stale/contradictory spots in `server/content/`:

- `indexes/skills-index.md` body says "Use these skills via the Claude Code skill machinery (`.claude/skills/<name>/SKILL.md`) or the Codex skill loader (`.agents/skills/<name>/SKILL.md`)" — but skills are explicitly **not shipped** to target repos; they're served via `graph_get_node('skills/<name>')`. An agent following this will hunt for files that don't exist.
- `integrations/rtk.md` says "The setup gate's `fab --version` / `fab api workspaces` probes are the only direct `fab` use" — the current gate (`entry.md`) contains no such probes; direct `fab` is forbidden everywhere else ("All fabric instructions must use `fabric-vibe *`").
- `session/operating-rules.md` simultaneously says per-topic state "lives only as graph nodes, not as `memory/<topic>/...` files" and instructs "Use `memory/rules/fabric-platform.md` … as active runtime rules", referencing backing-file paths agents are told not to read. (If the file-path mentions exist to feed the auto-edge extractor, keep the `[[rules/...]]` wiki-links and drop the raw paths.)

**Why it matters**: The graph is the agent's *only* knowledge source by design — its internal consistency is the harness. Stale nodes cost retry loops and erode the model's trust in the graph ("the graph said X, reality is Y"), which encourages exactly the improvisation the anchor sentence tries to prevent.

**How to fix**: Correct the three nodes, then extend `agent_guidance.py` with truth-coupling checks where cheap: e.g. assert `skills-index.md` does **not** contain `.claude/skills/`, and that `rtk.md` does not contain `fab api` (mirroring the existing `platform_rules_use_wrapper()` check). For the general problem, a periodic "graph lint" (a builder pass that flags nodes referencing paths/commands that don't exist in the repo) would scale better than per-phrase tests.

### MED-2 · Prompt-level prohibitions that could be mechanical

**What**: Several safety rules exist only as prose although the harness has the machinery to enforce them:

- "Agents never call the Fabric CLI directly" — but there is no `deny: Bash(fab *)` in `settings.local.json` (the validator only forbids *allowlisting* it; default-ask still lets a user click through).
- "Use `graph_delete_node` / `graph_remove_edge` only when explicitly asked" — yet both destructive tools are **auto-allowed** in `settings.local.json`. Codex, by contrast, pre-approves only the four read tools — the two profiles disagree on write-tool friction.
- "Agents must not run `fabric-vibe setup`" — but `Bash(fabric-vibe *)` is allowlisted wholesale, which includes `setup`.

**Why it matters**: The project's own philosophy (deny rules for `.env`, validator-blocked allowlist entries) is that important prohibitions live in the harness, not the prompt. These three are the remaining gaps, and `graph_delete_node` is the one that destroys institutional memory if a model misfires.

**How to fix**: Add `"Bash(fab *)"` and `"Bash(fabric-vibe setup*)"` to `deny`; remove `graph_delete_node`/`graph_remove_edge` from `allow` so they fall back to ask-per-use (matching Codex's posture). Optionally extend the `PreToolUse` hook to exit 2 on `fab `-prefixed commands with a message pointing at `fabric-vibe`.

### MED-3 · The `PreToolUse` rtk hook is brittle when rtk is absent

**What**: `settings.local.json` runs `rtk hook claude` before every Bash call. If `rtk` isn't on PATH (setup skipped, fresh machine, CI), every single Bash invocation emits a hook error.

**Why it matters**: Persistent per-call hook noise degrades sessions and trains users to ignore hook output. The RTK content node says rtk "is installed by `fabric-vibe setup`" — so a pre-setup session (exactly the one the gate is designed for) is guaranteed to hit this.

**How to fix**: Guard the hook: `command -v rtk >/dev/null 2>&1 && rtk hook claude || true` (and the PowerShell equivalent if needed). One line, removes the entire failure mode.

### MED-4 · Tester's charter and tool surface disagree

**What**: `tester.md` tells the agent to fetch the fabric-validate workflow "before **writing** or running DQ checks", but its `tools:` list has no `Write`/`Edit`. Meanwhile it does have `Bash`, so the restriction is cosmetic anyway (heredocs can write files).

**Why it matters**: Either the tester is supposed to author DQ notebooks (then the tool list blocks the happy path and invites Bash workarounds, which are worse for auditability), or it isn't (then the prompt text is wrong). Tool lists should encode the intended privilege honestly.

**How to fix**: Decide the charter. If tester authors DQ checks: add `Write`/`Edit`. If tester is validate-only: change the prompt to "before running DQ checks" and route DQ authoring to developer (which the orchestrator's routing table already implies). Same review for operator: it has `Bash` + a "never modify" charter — acceptable since it needs `fabric-vibe workspace init`, but worth a comment, or a `disallowedTools` entry if supported.

### LOW-1 · Root guidance: "three top-level packages" lists two

`CLAUDE.md` and `AGENTS.md` both say "The repo has three top-level packages" then enumerate only `cli/` and `server/`. The third (`frontend/`, present in the repo and in `docker-compose.yml`) is undocumented. Fix the count and add a one-line `frontend/` bullet — contributor agents use this file as their map, and an unexplained top-level directory invites wrong guesses.

### LOW-2 · Skill-split rule is stated as done but is ~one-quarter done

Root guidance says "Long skills (> 150 lines) are split into `sections/`", but only `fabric-notebook-loop` is split; `fabric-ingest` (219), `fabric-transform` (202), `fabric-validate` (176) exceed the threshold and aren't in `SPLIT_SKILLS`. The test docstring honestly says follow-ups are planned — but the guidance file states it as an invariant. Either split the remaining three (the test framework makes each one cheap: add an entry to `SPLIT_SKILLS`, split, run), or soften the CLAUDE.md sentence to "are being split". Better: add a test that *fails* when any non-split skill exceeds 150 lines, turning the threshold into a real gate instead of an aspiration.

### LOW-3 · Non-standard frontmatter keys on Claude agents

`links:` and `skills:` in `cli/profiles/claude/agents/*.md` are not Claude Code agent frontmatter fields — the runtime ignores them (they appear to feed `build-agent-capability-graph.py`). That's fine, but a reader (or future contributor agent) will assume `skills: [fabric-ingest, …]` grants runtime skill access, which it doesn't — skills here are graph-served, not installed. Add a one-line comment in each file (or in contributor guidance) stating these keys are capability-graph metadata only.

### LOW-4 · Entry-gate copy-editing

`entry.md`: the "MCP server reachable" table row has two cells in a three-column table (renders off-by-one), and the paragraph "Highlight all security risks if you try any other command then ask for user instruction" is garbled enough that models may interpret it loosely. Suggested rewrite: *"If a needed command is not covered by `fabric-vibe`, stop — you do not have permission for it. Name the command, state the security risk of running it directly, and ask the user how to proceed."* In a gate that agents must "follow literally", literal-quality prose matters.

---

## Priority summary

| # | Finding | Severity | Effort |
|---|---|---|---|
| HIGH-1 | Subagent `tools:` lists exclude mandated MCP tools | Breaks core flow | Small |
| HIGH-2 | Orchestrator routing not executable in Claude Code | Design gap | Medium |
| HIGH-3 | Inconsistent MCP tool/server names (incl. stray-dot form) | Failed tool calls | Small |
| HIGH-4 | No CI on PR/push — validators don't gate merges | Process gap | Small |
| MED-1 | Stale/contradictory graph nodes (skills-index, rtk, operating-rules) | Erodes graph trust | Small |
| MED-2 | Destructive/forbidden ops allowed at harness level (`graph_delete_node`, `fab`, `fabric-vibe setup`) | Security/consistency | Small |
| MED-3 | rtk PreToolUse hook errors when rtk absent | Session noise | Trivial |
| MED-4 | Tester tool surface vs. charter mismatch | Consistency | Trivial |
| LOW-1–4 | Doc count error, skill-split drift, frontmatter clarity, entry-gate copy | Polish | Trivial–small |

The common thread across HIGH-1/2/3 and MED-2: **this project already proved it knows how to turn prompt rules into harness mechanics and tests — the remaining work is applying that same standard to tool grants, routing, and naming.** Each fix above comes with a validator extension so the bug class, not just the instance, is closed.
