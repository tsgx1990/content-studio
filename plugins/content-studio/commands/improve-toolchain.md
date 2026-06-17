---
description: Improve the toolkit itself (gates/skills/libs/schemas/renderers) from real evidence. Args optional: target="render lesson/drama" or a backlog id (e.g. TC-003); mode=audit|implement.
---

Improve the content toolchain. Parse arguments from: $ARGUMENTS

Invoke the **toolchain-improvement** skill:
1. **Audit** for real signals — run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs`; scan recent `PROGRESS.md`/`PLAN.md`,
   manual workarounds in skills, gate-coverage gaps, duplication, and friction in real `projects/`
   runs. Refresh `docs/toolchain-backlog.md` and recommend the top item.
2. **Pick ONE** — the `target` if given, else the top open backlog item. One improvement = one commit.
3. **Design (minimal) via the `tech-architect` subagent**, guarding the v1 scope boundary (no `src/`
   engine, provider adapters, CLI, Web UI, DB, or build toolchain).
4. **Implement + test** — ship a deterministic `scripts/test-*.mjs` wired into `check.mjs` that would
   fail without the change; make behavior changes opt-in so existing demos still pass. Update the
   skill(s) that should now use the capability.
5. **Verify + record** — `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs` green (run it yourself); set the backlog item to
   `done (date)`; add a `PROGRESS.md` entry; commit + push.

If the audit finds nothing actionable, say so and stop — do not manufacture busywork.
