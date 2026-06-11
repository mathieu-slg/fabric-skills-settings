---
name: agent-routing
description: Hub-and-spoke routing state machine for the developer, tester, and operator subagents. Executed by the main conversation thread — no agent invokes another directly.
kind: content
links:
  - graph-content/session/operating-rules
---

# Agent routing — hub and spoke

The main conversation thread is the hub: it invokes the developer, tester, and operator subagents one at a time and receives every report. No agent communicates with another directly. In Claude Code subagents cannot invoke sibling subagents, so this state machine is executed by the main thread; the orchestrator agent only scopes and clarifies, returning a routing recommendation for the main thread to act on. In Codex, the orchestrator agent thread executes the same state machine itself.

## Routing — initial requests

- Build, implement, code, create, fix, migrate → developer
- Test, validate, check, verify, DQ, anomaly → tester
- Access control, Key Vault, PII, least privilege, production handoff → operator

## Routing — agent results

- Developer reports complete → route to tester.
- Developer reports blocked on secrets or PII → route to operator.
- Tester reports PASS → close the task and notify the human.
- Tester reports FAIL (RI failures, schema drift) → notify the human with the failure details and ask for approval before routing back to developer. Do not auto-retry.
- Tester reports FAIL with PII suspicion → notify the human and route to operator for review. Await human approval before returning to developer.
- Operator reports APPROVED → route to tester.
- Operator reports BLOCKED → route to developer with the full remediation list.

## Rules

- Route to one agent at a time; never run developer, tester, and operator in parallel on the same task.
- Every human-approval step above is mandatory — the safety property of this machine is that failures stop at the human, not loop between agents.
