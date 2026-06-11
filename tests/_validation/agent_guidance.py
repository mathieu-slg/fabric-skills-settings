"""Validate source-package guidance for the vendor-native installer setup.

Importable form of the former packaging/validators/validate-agent-guidance.py.
Profiles are checked only for hard-minimal shape (<= 50 lines, must mention the
graph tool, no operational section headings); operational content lives in
graph-content nodes. Call `collect_errors(root)`; empty list means valid.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REQUIRED_SKILLS = {
    "rtk",
    "fabric-ingest",
    "fabric-transform",
    "fabric-model",
    "fabric-validate",
    "fabric-notebook-loop",
    "fabric-ops",
    "fabric-pipeline",
    "semantic-model",
    "mock-data",
    "prd",
    "grill-me",
    "git-commit",
    "caveman",
}
REQUIRED_AGENTS = {"orchestrator", "developer", "tester", "operator"}
FORBIDDEN_GUIDANCE_PHRASES = [
    "configuration wrapper",
    "authoritative harness",
    "ignore target repo instructions",
    "everything goes to `$TARGET_REPO_PATH`",
]
PROFILE_MAX_LINES = 50
PROFILE_ANCHOR = "You know NOTHING about this project except how to call the graph tool"
PROFILE_ENTRY_TOOL = "graph_get_entry"
PROFILE_FORBIDDEN_SECTION_NAMES = [
    "## Pipeline Structure",
    "## Tool Layout",
    "## Directory Layout",
    "## Operating Rules",
    "## Notebook Workflow",
    "## Smoke-test Diagnostics",
    "## Semantic Models",
    "## Workspace Management",
]
# Auto-allowing these would let a misfire destroy graph knowledge or bypass
# the human-owned bootstrap; they must stay ask-per-use / denied.
SETTINGS_FORBIDDEN_ALLOW = (
    "Bash(fab *)",
    "Bash(rtk *)",
    "mcp__fabric__fabric_api_get",
    "mcp__fabric-server__graph_delete_node",
    "mcp__fabric-server__graph_remove_edge",
)
SETTINGS_REQUIRED_DENY = (
    "Bash(fab *)",
    "Bash(fabric-vibe setup*)",
)
# Canonical MCP exposure: `fabric-server` (hyphen) in Claude Code,
# `fabric_server` (underscore) in Codex. Anything else is a stale name that
# makes the mandatory first tool call fail.
MCP_FORBIDDEN_TOKENS = (
    "mcp__fabric_graph",
    "mcp__fabric-graph",
    "fabric-graph",
    "mcp__fabric_server__.",
    "mcp__fabric-server__.",
)
FABRIC_SERVER_TOOLS = (
    "graph_get_entry",
    "graph_get_node",
    "graph_get_linked",
    "graph_search",
    "graph_list_kinds",
    "graph_create_node",
    "graph_update_node",
    "graph_delete_node",
    "graph_add_edge",
    "graph_remove_edge",
    "pipeline_lineage_check",
    "data_mock_generate",
    "semantic_model_list",
    "semantic_model_show",
)
_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.DOTALL)


def _skill_names(base: Path) -> set[str]:
    return {p.parent.name for p in base.glob("*/SKILL.md")} if base.exists() else set()


def _agent_names(base: Path, suffix: str) -> set[str]:
    return {p.stem for p in base.glob(f"*{suffix}")} if base.exists() else set()


class _Validator:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.profile_files = [
            root / "cli" / "profiles" / "claude" / "CLAUDE.md",
            root / "cli" / "profiles" / "codex" / "AGENTS.md",
        ]
        self.graph_content = root / "server" / "content"
        self.entry_file = self.graph_content / "entry.md"
        self.operating_rules_file = self.graph_content / "session" / "operating-rules.md"
        self.skills_index_file = self.graph_content / "indexes" / "skills-index.md"
        self.forbidden_root_runtime = [
            root / ".claude" / "agents",
            root / ".claude" / "skills",
            root / "skills",
        ]
        self.errors: list[str] = []

    def _rel(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.root))
        except ValueError:
            return str(path)

    def _require(self, path: Path) -> None:
        if not path.exists():
            self.errors.append(f"missing required path: {self._rel(path)}")

    # ── checks ───────────────────────────────────────────────────────────────
    def root_guidance(self) -> None:
        for path in (self.root / "AGENTS.md", self.root / "CLAUDE.md", self.root / "README.md"):
            self._require(path)
            if not path.exists():
                continue
            text = path.read_text(errors="ignore")
            if "fabric-vibecoding-agents" not in text:
                self.errors.append(
                    f"{self._rel(path)} must describe installer-first usage (fabric-vibecoding-agents)"
                )
            if "profiles/codex" not in text and path.name != "README.md":
                self.errors.append(f"{self._rel(path)} must reference profiles/codex")
            if "profiles/claude" not in text and path.name != "README.md":
                self.errors.append(f"{self._rel(path)} must reference profiles/claude")
            for phrase in FORBIDDEN_GUIDANCE_PHRASES:
                if phrase in text:
                    self.errors.append(f"forbidden wrapper phrase {phrase!r} in {self._rel(path)}")

    def profiles(self) -> None:
        r = self.root
        self._require(r / "cli" / "profiles" / "codex" / "AGENTS.md")
        self._require(r / "cli" / "profiles" / "codex" / "config.toml")
        self._require(r / "cli" / "profiles" / "claude" / "CLAUDE.md")
        self._require(r / "cli" / "profiles" / "claude" / "settings.local.json")
        if (r / "cli" / "profiles" / "claude" / "settings.json").exists():
            self.errors.append(
                "profiles/claude/settings.json must not exist; Claude local installs use settings.local.json"
            )
        self._require(r / "server" / "content" / "rules" / "data-engineering.md")
        self._require(r / "server" / "content" / "rules" / "fabric-platform.md")
        self._require(r / "server" / "content" / "rules" / "security.md")

        server_skills = _skill_names(r / "server" / "skills")
        if (r / "cli" / "profiles" / "skills").exists():
            self.errors.append("cli/profiles/skills must not exist; skills moved to server/skills/")
        if server_skills != REQUIRED_SKILLS:
            self.errors.append(f"Server skill set mismatch: {sorted(server_skills)}")

        codex_agents = _agent_names(r / "cli" / "profiles" / "codex" / "agents", ".toml")
        claude_agents = _agent_names(r / "cli" / "profiles" / "claude" / "agents", ".md")
        if codex_agents != REQUIRED_AGENTS:
            self.errors.append(f"Codex agent set mismatch: {sorted(codex_agents)}")
        if claude_agents != REQUIRED_AGENTS:
            self.errors.append(f"Claude agent set mismatch: {sorted(claude_agents)}")
        if codex_agents != claude_agents:
            self.errors.append("Codex and Claude profile agents differ")

        settings = r / "cli" / "profiles" / "claude" / "settings.local.json"
        if settings.exists():
            try:
                data = json.loads(settings.read_text(errors="ignore"))
            except json.JSONDecodeError as exc:
                self.errors.append(f"{self._rel(settings)} is not valid JSON: {exc}")
                return
            permissions = data.get("permissions", {})
            allow = permissions.get("allow", [])
            deny = permissions.get("deny", [])
            for phrase in SETTINGS_FORBIDDEN_ALLOW:
                if phrase in allow:
                    self.errors.append(
                        f"{self._rel(settings)} must not allow {phrase!r}; agents consume only the safe sandbox workspace"
                    )
            for phrase in SETTINGS_REQUIRED_DENY:
                if phrase not in deny:
                    self.errors.append(
                        f"{self._rel(settings)} must deny {phrase!r}; this prohibition is harness-level, not prompt-level"
                    )

    def profile_minimalism(self) -> None:
        for path in self.profile_files:
            if not path.exists():
                continue
            text = path.read_text(errors="ignore")
            line_count = text.count("\n") + (0 if text.endswith("\n") else 1)
            if line_count > PROFILE_MAX_LINES:
                self.errors.append(
                    f"{self._rel(path)} has {line_count} lines; hard-minimal profile must be <= {PROFILE_MAX_LINES}"
                )
            if PROFILE_ENTRY_TOOL not in text:
                self.errors.append(f"{self._rel(path)} must reference {PROFILE_ENTRY_TOOL!r}")
            if PROFILE_ANCHOR not in text:
                self.errors.append(
                    f"{self._rel(path)} must contain anti-drift anchor sentence: {PROFILE_ANCHOR!r}"
                )
            for forbidden in PROFILE_FORBIDDEN_SECTION_NAMES:
                if forbidden in text:
                    self.errors.append(
                        f"{self._rel(path)} contains operational section heading {forbidden!r};"
                        " move that content to a graph-content node"
                    )

    def entry_node(self) -> None:
        if not self.entry_file.exists():
            self.errors.append(f"missing entry node: {self._rel(self.entry_file)}")
            return
        text = self.entry_file.read_text(errors="ignore")
        required = [
            # Target bootstrap (raw scripts — runs before fabric-vibe is on the target's PATH).
            "fabric-vibe setup",
            "FABRIC_WORKSPACE_ID",
            "graph_get_entry",
            # Daily helpers go through the fabric-vibe proxy.
            "fabric-vibe workspace init",
            "fabric-vibe workspace switch",
            "fabric-vibe notebook deploy",
            "Do **not** read `.env` contents",
            "Setup incomplete",
            "Mandatory setup gate",
            "before accepting any Fabric work",
            "network",
            "lakehouse",
            "notebook",
        ]
        for phrase in required:
            if phrase not in text:
                self.errors.append(f"missing required phrase in {self._rel(self.entry_file)}: {phrase!r}")
        if "FABRIC_WORKSPACE_ID` is missing" in text:
            self.errors.append(
                f"entry node {self._rel(self.entry_file)} implies reading .env via 'FABRIC_WORKSPACE_ID` is missing'"
            )

    def skills_index_node(self) -> None:
        if not self.skills_index_file.exists():
            self.errors.append(f"missing skills index node: {self._rel(self.skills_index_file)}")
            return
        text = self.skills_index_file.read_text(errors="ignore")
        for skill in REQUIRED_SKILLS:
            if f"`{skill}`" not in text:
                self.errors.append(f"{self._rel(self.skills_index_file)} must list installed skill `{skill}`")
        for stale in (".claude/skills/", ".agents/skills/"):
            if stale in text:
                self.errors.append(
                    f"{self._rel(self.skills_index_file)} references installed skill path {stale!r};"
                    " skills are graph-served, not shipped to target repos"
                )

    def session_nodes(self) -> None:
        if not self.operating_rules_file.exists():
            self.errors.append(f"missing operating-rules node: {self._rel(self.operating_rules_file)}")
            return
        text = self.operating_rules_file.read_text(errors="ignore")
        for rule_id in ("rules/security", "rules/data-engineering", "rules/fabric-platform"):
            if rule_id not in text:
                self.errors.append(f"{self._rel(self.operating_rules_file)} must reference {rule_id!r}")

    def platform_rules_use_wrapper(self) -> None:
        path = self.root / "server" / "content" / "rules" / "fabric-platform.md"
        if not path.exists():
            return
        text = path.read_text(errors="ignore")
        for phrase in ("fab auth login", "fab auth token", "fab api "):
            if phrase in text:
                self.errors.append(
                    f"{self._rel(path)} must reference the MCP fabric_* tools instead of raw {phrase!r}"
                )

    def rtk_node_uses_wrapper(self) -> None:
        path = self.graph_content / "integrations" / "rtk.md"
        if not path.exists():
            return
        text = path.read_text(errors="ignore")
        for phrase in ("fab api ", "fab auth", "fab --version"):
            if phrase in text:
                self.errors.append(
                    f"{self._rel(path)} references direct fab usage {phrase!r};"
                    " all Fabric access goes through fabric-vibe and the MCP tools"
                )

    def mcp_canonical_names(self) -> None:
        """Stale or malformed MCP server/tool names cause failed first tool calls."""
        scan = list(self.profile_files)
        scan.extend(sorted(self.graph_content.rglob("*.md")))
        scan.extend(sorted((self.root / "cli" / "profiles" / "claude" / "agents").glob("*.md")))
        scan.extend(sorted((self.root / "cli" / "profiles" / "codex" / "agents").glob("*.toml")))
        scan.append(self.root / "cli" / "profiles" / "codex" / "config.toml")
        for path in scan:
            if not path.exists():
                continue
            text = path.read_text(errors="ignore")
            for token in MCP_FORBIDDEN_TOKENS:
                if token in text:
                    self.errors.append(
                        f"{self._rel(path)} contains non-canonical MCP name {token!r};"
                        " use mcp__fabric-server__<tool> (Claude) or mcp__fabric_server__<tool> (Codex)"
                    )

    def agent_mcp_tool_wiring(self) -> None:
        """Every fabric-server tool an agent's body mandates must be granted in its
        `tools:` frontmatter — a declared tools list excludes MCP tools by default."""
        agents_dir = self.root / "cli" / "profiles" / "claude" / "agents"
        if not agents_dir.exists():
            return
        token_re = re.compile(r"\b(" + "|".join(FABRIC_SERVER_TOOLS) + r")\b")
        for path in sorted(agents_dir.glob("*.md")):
            match = _FRONTMATTER_RE.match(path.read_text(errors="ignore"))
            if match is None:
                self.errors.append(f"{self._rel(path)} has no parseable YAML frontmatter")
                continue
            frontmatter, body = match.groups()
            if "tools:" not in frontmatter:
                continue  # no tools restriction → agent inherits all tools incl. MCP
            for tool in sorted(set(token_re.findall(body))):
                if f"mcp__fabric-server__{tool}" not in frontmatter:
                    self.errors.append(
                        f"{self._rel(path)} body references {tool!r} but its tools list"
                        f" does not grant mcp__fabric-server__{tool}"
                    )

    def agent_routing_node(self) -> None:
        """Routing is executed by the main thread; the state machine must live in the
        graph and be reachable from session-start, with both orchestrators pointing at it."""
        routing = self.graph_content / "session" / "agent-routing.md"
        if not routing.exists():
            self.errors.append(f"missing agent-routing node: {self._rel(routing)}")
            return
        session_start = self.graph_content / "session" / "session-start.md"
        if session_start.exists() and "agent-routing" not in session_start.read_text(errors="ignore"):
            self.errors.append(f"{self._rel(session_start)} must link graph-content/session/agent-routing")
        for path in (
            self.root / "cli" / "profiles" / "claude" / "agents" / "orchestrator.md",
            self.root / "cli" / "profiles" / "codex" / "agents" / "orchestrator.toml",
        ):
            if path.exists() and "graph-content/session/agent-routing" not in path.read_text(errors="ignore"):
                self.errors.append(
                    f"{self._rel(path)} must fetch the routing state machine from"
                    " graph-content/session/agent-routing"
                )

    def skill_wiring(self) -> None:
        r = self.root
        required = [
            (r / "cli" / "profiles" / "claude" / "agents" / "developer.md", ["fabric-transform", "fabric-model"]),
            (r / "cli" / "profiles" / "codex" / "agents" / "developer.toml", ["fabric-transform", "fabric-model"]),
            (r / "cli" / "profiles" / "claude" / "agents" / "tester.md", ["fabric-validate", "tester"]),
            (r / "cli" / "profiles" / "codex" / "agents" / "tester.toml", ["fabric-validate", "tester"]),
            (r / "server" / "content" / "rules" / "data-engineering.md", ["fabric-transform", "fabric-validate"]),
            (r / "server" / "content" / "rules" / "fabric-platform.md", ["fabric-model"]),
        ]
        for path, phrases in required:
            if not path.exists():
                self.errors.append(f"missing required path for skill wiring: {self._rel(path)}")
                continue
            text = path.read_text(errors="ignore")
            for phrase in phrases:
                if phrase not in text:
                    self.errors.append(f"missing skill wiring phrase {phrase!r} in {self._rel(path)}")

    def no_root_runtime(self) -> None:
        for path in self.forbidden_root_runtime:
            if path.exists():
                self.errors.append(f"root runtime directory should not exist in source package: {self._rel(path)}")

    def run(self) -> list[str]:
        self.root_guidance()
        self.profiles()
        self.profile_minimalism()
        self.entry_node()
        self.skills_index_node()
        self.session_nodes()
        self.platform_rules_use_wrapper()
        self.rtk_node_uses_wrapper()
        self.mcp_canonical_names()
        self.agent_mcp_tool_wiring()
        self.agent_routing_node()
        self.skill_wiring()
        self.no_root_runtime()
        return self.errors


def collect_errors(root: Path) -> list[str]:
    return _Validator(root).run()
