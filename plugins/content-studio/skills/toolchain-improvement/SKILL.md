---
name: toolchain-improvement
description: Continuously improve the content toolkit ITSELF (gates, skills, libs, schemas, renderers, hooks) from real evidence. Audit signals from actual practice, keep a prioritized backlog, then implement ONE minimal, tested change via the tech-architect subagent. For the code that produces content, not content. Refuses to ship a change without a deterministic test + green check.mjs.
---

# toolchain-improvement

## When to use

The user wants to make the toolkit better — close a gap a real content run exposed, remove a manual
workaround, de-duplicate logic, harden a gate — or asks an open-ended "what can we improve?". This is
the **meta** loop: it changes `scripts/` · `schemas/` · `.claude/skills|agents`, never `projects/`
content. (To produce content, use a content skill instead.)

The improvement bar: every change must be **evidence-driven** (a real signal, not a guess),
**minimal** (smallest change that fixes it, inside the v1 scope boundary), and **enforced** (ships
with a deterministic test so the improvement can't silently regress).

## Inputs

```yaml
target: string    # optional — a specific item/area (e.g. "render lesson/drama", a backlog id like TC-003).
```

Two entry points: **audit** (no `target`) runs steps 1–2 and then **stops** with a recommendation —
toolkit changes are real commits, so let the user pick what to act on (unless they already said "go").
**Implement** (a `target` given, or the user picks one) runs the full loop 1→8 on that item.

## The improvement loop

1. **Audit — gather real evidence** (don't invent improvements; find them). Check, in order:
   - `docs/toolchain-backlog.md` — its open items are standing evidence; start here.
   - `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs` — any failures *or advisory warnings* (e.g. AI-tell advisories).
   - recent `PROGRESS.md` entries + `PLAN.md` — recurring friction, "planned follow-up", deferred items.
   - **manual workarounds**: any skill step done "by hand" that could be deterministic (this is how
     `render.mjs` was found — `.md` was hand-assembled and drifted off its JSON).
   - **gate-coverage gaps**: a known failure mode for a content type with no gate rule catching it
     (this is how the shared `compliance-cn` 极限词 scan was extended to script/drama).
   - **duplication / drift risk**: the same logic in two scripts (extract to `scripts/lib/`, as
     `cjk-pacing` was) — DRY keeps gates and renderers from diverging.
   - **real content runs** under `projects/`: anything that needed re-work, hand-fixing, or that fails
     a gate repeatedly. Memory `feedback`/`project` notes and user complaints count as evidence too.
2. **Prioritize** — write findings into `docs/toolchain-backlog.md` (format below). Severity:
   **P0** correctness/safety/compliance gap or broken gate · **P1** removes real repeated friction ·
   **P2** nice-to-have / polish. Sort by severity then effort. Recommend the top item.
3. **Pick ONE** — the `target`, else the top backlog item. One improvement = one loop = one commit.
   Don't batch unrelated changes.
4. **Design the change (minimal).** Smallest change consistent with existing patterns — reuse
   `scripts/lib/` and the existing gate/skill shapes. For a non-trivial or cross-cutting change (a new
   vertical, a new gate, reworking a hook), delegate the decomposition to the **`tech-architect`**
   subagent and integrate its plan. For a change you already understand, design it inline — cold-starting
   a subagent to re-derive what you already know is wasted effort. Either way the v1 scope boundary is
   yours to guard (see below).
5. **Implement** — make the change. If it touches a gate's behavior, prefer **opt-in** so existing
   passing demos don't break (as the compliance scan did for script/drama). Update the affected
   skill(s) so the workflow actually uses the new capability.
6. **Enforce it (so it can't silently regress).** A behavior/code change MUST ship with a deterministic
   `scripts/test-*.mjs` that would FAIL without it (golden fixtures, exit-code assertions), registered
   in `scripts/check.mjs` — an untested gate/script change is not done. A pure docs/skill/prose change
   (editing a SKILL.md, AGENTS.md, a schema description) can't carry a unit test; verify it instead by
   keeping `check.mjs` green and checking the obvious invariants (every cross-reference resolves, code
   fences balanced, any line budget respected).
7. **Verify** — `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs` must be green (run it yourself; don't trust a subagent).
8. **Record + commit + report** — set the backlog item to `done` (date), add a `PROGRESS.md` entry
   (update `PLAN.md` if scope/priorities moved), commit + push per AGENTS.md → Git Workflow, then tell
   the user what changed and what's now top of the backlog.

## `docs/toolchain-backlog.md` format

One row per candidate; keep it the living cross-session memory for tool improvements.

```md
| id | title | evidence (the real signal) | severity | status | notes |
|----|-------|----------------------------|----------|--------|-------|
| TC-NNN | render lesson/drama | demos hand-segment paragraphs; .md drifts off JSON | P1 | open | needs canonical format + golden test |
```

`status`: `open` · `in-progress` · `done (YYYY-MM-DD)` · `dropped (why)`. Append; don't rewrite history.

## Scope guard (do not cross)

This skill **hardens v1**; it does not expand it. If an "improvement" means a `src/` LLM engine,
model-routing/provider adapters, an `acs` CLI, a Web UI, a database, or adding a build toolchain
(npm/typecheck/lint), **stop and put it to the user** — these are explicitly out of scope per AGENTS.md
→ Repository Model and need an owner's call, not a silent build-out. Improvements stay **zero-dependency
Node + Markdown skills + JSON schemas**.

## Quality gates (how to know a loop is done)

- The change is traceable to a real signal recorded in the backlog (not a guess).
- A code/behavior change ships with a deterministic `test-*.mjs` wired into `check.mjs`; a docs/prose
  change holds its invariants instead (refs resolve, fences balanced). Either way `check.mjs` is green.
- Existing demos still pass (behavior changes are opt-in or migrate the demos deliberately).
- Backlog updated to `done`; `PROGRESS.md` entry added; committed + pushed; user told what's next.

## Failure handling

- Audit finds nothing actionable → say so and stop; do not manufacture busywork.
- A change would break a passing demo → make it opt-in, or migrate the demo on purpose (and note it).
- Can't add a test that fails without the change → reconsider whether the "improvement" is real.
- Item is genuinely out of scope → record it as `dropped (out of v1 scope)` with the reason.
