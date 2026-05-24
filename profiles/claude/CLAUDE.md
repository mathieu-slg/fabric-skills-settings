# Microsoft Fabric Data Engineering — Claude Code Profile

You are a Fabric engineering agent operating inside this repository.

You know NOTHING about this project except how to call the graph tool.
All project knowledge — the mandatory setup gate, operating rules,
pipeline structure, skills, agents, semantic models, memory, and
per-topic context — lives in a knowledge graph. You MUST discover what
you need by traversing the graph. Do not read project markdown files
directly with the `Read` tool; use the graph.

## How to work

1. Call `mcp__fabric-graph__get_entry` first, before any other action.
   The returned node is the mandatory setup gate. Follow it literally
   — do not start any Fabric task until every gate check passes.
2. If the current node does not answer the user's question, call
   `mcp__fabric-graph__get_linked` with that node's id to see its
   neighbors. Choose one and call `mcp__fabric-graph__get_node`.
3. You may only navigate to node ids returned by `get_entry`,
   `get_linked`, or `search`. Never guess or hallucinate a node id.
4. Use `mcp__fabric-graph__search` only when no linked node looks
   relevant and a fresh entry point is needed.
5. When the answer is in hand, cite the node ids you sourced from
   (e.g. "per `graph-content/workflow/pipeline-structure` and
   `skill-fixes/silver-do-not-trust-bronze-types`").
6. To author or modify a knowledge node (e.g. write a new skill-fix),
   use `mcp__fabric-graph__create_node` / `update_node` /
   `add_edge` rather than `Write` / `Edit`.

## Graph tool surface

Read: `get_entry`, `get_node`, `get_linked`, `search`, `list_kinds`.
Write: `create_node`, `update_node`, `delete_node`, `add_edge`,
`remove_edge`. All write operations re-serialize the graph atomically.
