# Architecture (v1)

## What this is

An **AI Content Studio**, v1 scope. Two decisions shaped it:

1. **Claude Code native** — the AI agent is the workflow engine. No `src/` LLM engine,
   no model routing, no provider adapters, no `acs` CLI. State lives in files.
2. **SEO-first** — the first end-to-end loop is SEO articles. Long-form (novels) and
   other content types come after this loop is solid.

## How a piece of content flows

```text
/generate-content ──► seo-article skill ──► projects/{slug}/seo/{kw}.md   (draft + <!-- meta -->)
        │
/review-content ───► content-review skill
        │                ├─ seo-editor (subagent)
        │                └─ copyright-risk-reviewer (subagent)
        │            ──► projects/{slug}/seo/{kw}.review.json   (sidecar: publishable, copyright_risk, metadata)
        │
/publish-content ──► node scripts/check-prepublish.mjs   (HARD GATE, zero-dep)
                         │ exit 0
                         ▼
                     publish-content skill ──► front matter (from config/publish.json + sidecar)
                                          ──► write .md to Hexo _posts/  (write-only)
                                          ──► append publish-log.jsonl
```

## Why the gate is a script, not a prompt

An agent can skip steps; a Markdown rule cannot enforce itself. The single reproducible
guarantee is `scripts/check-prepublish.mjs`: it refuses publish unless a valid review
sidecar exists with `publishable: true`, `copyright_risk != high`, all required metadata
present, and no secret in the content. It is **zero-dependency** (`node`, no install/build).

## Two enforcement layers: scripts + hooks

The publish gate (`check-prepublish.mjs`) is a *pull* check — something must call it. Hooks add a
*push* layer: `.claude/settings.json` runs `scripts/hooks/guard-bash.mjs` and
`scripts/hooks/guard-secrets.mjs` at the PreToolUse boundary, so dangerous deletes / force-pushes
/ secret writes are blocked automatically (the PRD's "strong constraints belong in hooks"). Hooks
are Claude-Code-only and fail open; the same logic stays reachable as scripts (shared
`scripts/lib/secret-patterns.mjs`) so Codex/manual runs are still covered. Both layers have
fixture self-tests (`test-gate.mjs`, `test-hooks.mjs`).

## Why scores are not the gate

LLM-produced float scores are unstable and non-reproducible. `scores` in the sidecar are
advisory (for humans). The gate uses the boolean `publishable` + `copyright_risk` enum.

## File contracts

- `project.yaml` — YAML, human + agent edited (no script reads it, so no YAML dep needed).
- `*.review.json` — JSON, conforms to `schemas/review.schema.json`, read by the gate.
- `config/publish.json` — JSON, the only place a blog path / front-matter mapping lives.

## Compatibility

- `AGENTS.md` is the canonical rule set (works for Codex and any agent).
- `CLAUDE.md` imports it via `@AGENTS.md` and adds only Claude-Code-specific conventions.
- Rules are maintained once, in `AGENTS.md`.

## Extending later (not in v1)

- New content type: add a skill + reuse `content-review` + the gate; store content with a
  sidecar under `projects/{slug}/`.
- New publish target (e.g. WordPress): add a target to `config/publish.json` and a branch
  in the `publish-content` skill. Flip `writeOnly` to enable a deploy step (with confirmation).
- Long-form: add `story-bible`, `state-update`, `continuity-editor`; track state as files
  under the project (timeline, foreshadowing, characters).
