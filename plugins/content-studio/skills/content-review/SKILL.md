---
name: content-review
description: Review a content file against quality, intent, originality and safety dimensions, then write a <basename>.review.json sidecar. Use before publishing any content.
---

# content-review

## When to use

A content draft exists and needs review before publishing. This skill produces the
`*.review.json` **sidecar** that the publish gate (`scripts/check-prepublish.mjs`) reads.
No sidecar with `publishable: true` => no publishing.

## Inputs

```yaml
file: string    # path to the content .md (e.g. projects/{slug}/seo/{kw}.md)
```

## Workflow

1. Read the content file (and its `project.yaml` for context).
2. Evaluate against the dimensions below. For prose content (SEO articles, stories, 公众号
   long-form), run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs <file>` — if it flags BLOCK-tier tells
   (em-dash overuse, AI clichés, antithesis cliché), list them in `must_fix` and set
   `publishable: false`; treat the advisory warnings (incl. 中/英引号混用 — ZH should use “ ”,
   EN ASCII ") as `should_fix`. A draft that reads as
   machine-written is not publishable. **For ZH prose that has no structured JSON gate** (a
   公众号/长文 article), add `--compliance` (or `--compliance=education,…`) so 极限词/承诺词 are
   caught here too; a 极限词 hit is a `must_fix` + `publishable: false`. **If the content cites
   year-stamped reference data** (e.g. 一分一段 位次), run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-freshness.mjs <file>`
   too — a value that has drifted off its `*.data.json` source is a `must_fix`; a stale `data_year`
   is a `should_fix`.
3. Delegate specialist judgment to subagents:
   - **`seo-editor`** for SEO articles (intent match, title/description, structure, keyword naturalness).
   - **`copyright-risk-reviewer`** to set `copyright_risk` and flag imitation/protected-IP issues.
4. Lift the proposed `title` / `description` / `tags` from the draft's `<!-- meta -->`
   block (or derive them) into `metadata`.
5. Set `monetization` (carry over from the research's `monetization_fit`). If it is
   `affiliate`, verify the content contains an FTC disclosure — the publish gate will block
   affiliate content that lacks one.
6. Decide `publishable` (a hard boolean) and write the sidecar.
7. **Validate the contract** — run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs <path-to.review.json>`
   (the publish gate validates it too, but catch schema errors here so review never produces a
   malformed sidecar).

## Reviewing a batch (N files)

When several pieces need review at once, **triage mechanically first, then parallelize judgment**:

1. `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-batch.mjs <dir|path ...>` — one rollup line per file (publish gate, schema,
   the per-type gate, AI-tells, freshness). It reuses the same gates, so a `✖` here is a real
   mechanical failure; a `⚠` is advisory (AI-tells / stale data).
2. **Fix the `✖` files first** — a piece that fails mechanics isn't worth a reviewer's attention yet.
3. For the files that clear mechanics, **dispatch the specialist reviewers in parallel** (per
   AGENTS.md → Parallel Execution): independent pieces are a good fan-out: one review subagent per
   file, each writing its `*.review.json`. Integrate, then re-run `check-batch` (or `check.mjs`)
   yourself before committing. The gates stay the source of truth; subagents add judgment, faster.

## Review dimensions

1. Structure & completeness
2. Search-intent / audience fit
3. Logical consistency
4. Pacing & readability (scannable, not filler)
5. Originality risk (imitation / protected IP)
6. Platform fit
7. Publish risk (claims needing verification, sensitive info)

## Output — `<basename>.review.json`

Conform to `schemas/review.schema.json`:

```json
{
  "content_id": "how-to-x",
  "content_type": "seo-article",
  "reviewed_at": "2026-06-05T12:00:00+08:00",
  "reviewers": ["content-review", "seo-editor", "copyright-risk-reviewer"],
  "publishable": true,
  "copyright_risk": "low",
  "scores": { "overall": 8.4 },
  "must_fix": [],
  "should_fix": [],
  "nice_to_have": [],
  "metadata": {
    "title": "How to X: a practical guide",
    "description": "A concise, accurate meta description under 160 chars.",
    "tags": ["x", "guide"],
    "categories": ["seo"]
  }
}
```

## Quality gates (how to set `publishable`)

Set `publishable: false` (and list `must_fix`) if ANY of these hold:

- structure is broken or the search intent is not satisfied;
- there is keyword stuffing or fabricated experience/claims;
- `copyright_risk` is `medium`/`high` with unresolved issues;
- required metadata (`title`, `description`, `tags`) cannot be produced.

`scores` are advisory only — never the gate. The reproducible gate is the boolean
`publishable` plus `copyright_risk`, enforced by `scripts/check-prepublish.mjs`.

## Failure handling

- If the draft is far below bar, set `publishable: false` and recommend a rewrite rather than line edits.
- Never silently fix and pass; record issues so the revision is traceable.
