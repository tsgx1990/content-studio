# AGENTS.md

> Canonical project rules — the single source of truth for every AI agent (Codex, Claude Code,
> others). **All rules live here**, including Claude-specific ones ("Claude Code specifics" at end).
> `CLAUDE.md` is a thin pointer that imports this file — put no rules there.

## Purpose

An **AI Content Studio**: a toolkit that helps an AI agent reliably plan, draft, review, revise, and
publish content. First vertical is **SEO articles**; long-form (novels) + other types build on it.

## Repository Model (v1)

v1 is **Claude Code native** — no standalone LLM engine.

- The "workflow engine" is the agent itself, following `.claude/skills/`.
- All state is plain files under `projects/` (Markdown content + JSON sidecars).
- The only code is small **zero-dependency** Node scripts in `scripts/` acting as **deterministic
  gates** (run with `node`; no build, no `npm install`, no typecheck/lint).
- Do **not** build `src/` model-routing / provider-adapter / CLI engines, or add a build toolchain —
  out of scope for v1. If a task asks for that, stop and confirm.

## Directory Structure

```text
AGENTS.md · CLAUDE.md          # rules (CLAUDE.md just imports AGENTS.md)
config/publish.json            # publish targets (Hexo path + front matter) — EDIT before publishing
schemas/                       # JSON contracts the gates + validator enforce
scripts/check.mjs              # repo health: every sidecar + gate + self-test (run before finishing)
scripts/check-prepublish.mjs   # publish gate (SEO also enforces a pursue *.research.json)
scripts/check-<type>.mjs       # one deterministic gate per content type (see Content Types)
scripts/check-ai-tells.mjs     # AI-tell prose scanner, bilingual EN+ZH
scripts/render.mjs             # JSON source -> canonical .md projection (note/script/lesson/drama)
scripts/validate-sidecar.mjs · build-chapter-context.mjs · build-topic-feedback.mjs
scripts/lib/                   # shared zero-dep libs (json-schema-mini, secret-patterns, compliance-cn, cjk-pacing, …)
scripts/hooks/                 # guard-bash, guard-secrets, session-context
scripts/test-*.mjs             # fixture self-tests (run by check.mjs)
.claude/skills/ · agents/ · commands/ · settings.json
projects/{slug}/               # one project (site/series)
  project.yaml                 #   human-edited config (YAML)
  seo/{lang}/{kw}.{research,review}.json + .md         # SEO: research gate + draft + review
  {type}/{lang}/{slug}.<src>.json + .md + .review.json # per-type source -> rendered .md + review
  novel/{bible.md,state.json,chapters/}               # long-form
  analytics/*.csv -> {slug}.feedback.json             # real GSC/GA4 in -> next-topic evidence out
  publish-log.jsonl            #   append-only publish history
docs/                          # architecture, design + research notes
```

Each script's exact rules live in its header comment — don't duplicate that catalog here.

## Content Workflow (mandatory)

No content reaches a publish target without this pipeline:

```text
research → draft → review → (revise) → publish-gate → write to target
```

- **research** (`keyword-research`): writes `*.research.json` with REAL SERP data + a pursue/skip
  `decision`. The real-data entry point — drafting on guesses is the failure this prevents.
- **draft** (a content skill, e.g. `seo-article`): grounded in the research; refuses without it.
- **review** (`content-review` + specialist subagents): writes a `*.review.json` sidecar.
- **publish** (`publish-content`): **must** run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <content.md>` and
  refuse if it exits non-zero. For SEO it also code-enforces a sibling `pursue` `*.research.json` —
  "never publish on guesses" is enforced, not trust-based.

### Keyword data (provider-agnostic, honest)

`keyword-research` fills `schemas/keyword-research.schema.json`; always record `source` +
`data_quality` honestly. **web-search** (default): real SERP, `estimated`, `search_volume: null` —
never fabricate a volume. **manual**: user-pasted Ahrefs/百度指数 numbers → `measured`.
**api:<name>**: reserved.

## Content Types

Every type is one vertical: a skill + a JSON source-of-truth + a deterministic gate + a rendered
`.md` + a `*.review.json`, reusing `content-review` + `check-prepublish.mjs`. To add one, follow this
same model. `seo-article` is the live loop; `novel` is validated at 24-ch/3-arc (`docs/long-form.md`).

| type | source | gate |
|---|---|---|
| seo-article | `seo/{l}/{kw}.md`+`.research.json` | check-prepublish |
| novel / long-form | `novel/state.json` | check-continuity, build-chapter-context |
| children-story | `stories/{l}/{s}.spec.json` | check-readability |
| interactive-fiction | `if/{l}/{s}.if.json` | check-storygraph |
| youtube-script | `video/{l}/{s}.script.json` | check-script |
| xhs-post (小红书) | `xhs/{l}/{s}.note.json` | check-xhsnote |
| short-drama (微短剧) | `drama/{l}/{s}.drama.json` | check-short-drama |
| english-learning-story | `learn/{l}/{s}.lesson.json` | check-graded-reader |
| game-story | `game/{l}/{s}.game.json` | check-game-story |
| audio-story | `audio/{l}/{s}.audio.json` | check-audio-story |

- **ZH marketing types** (xhs-post, short-drama, youtube-script) share `scripts/lib/compliance-cn.mjs`
  (极限词 + 导流 scan; opt-in 教育/医疗/金融 promise-words via a `compliance.industries` JSON block).
- **Social/video topics reuse `keyword-research`** (SearXNG, `language: zh`) — never invent demand.

## Build / Check Commands

```bash
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs                              # repo health (run before finishing)
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <content.md>      # publish gate
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-<type>.mjs <source.json>         # the per-type gate
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs <content.md> [--strict] [--compliance[=industries]]  # AI-tell scanner (EN+ZH); warns on 中/英引号混用 (ZH→“ ”, EN→"); --compliance adds 极限词/承诺词 scan to ZH prose
node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs <source.json> [--write]     # render note/script/lesson/drama -> .md (don't hand-assemble)
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-freshness.mjs <file> [--current-year=N]  # year-stamped data gate: warn if stale; block if a cited 分数≈位次万 drifts off its *.data.json source
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-batch.mjs <path|dir ...> [--json]  # scoped readiness triage for N pieces: per-file publish/schema/per-type-gate/ai-tells/freshness rollup (reviewing a batch)
node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs <sidecar.json>    # validate a sidecar against its schema
```

`check.mjs` is the one "is the repo healthy?" command — every sidecar validated, the publish gate run
on every drafted article, all self-tests run.

## Hooks (deterministic enforcement — Claude Code)

`.claude/settings.json` wires hooks so the safety rules don't depend on the agent remembering:
`guard-bash` (PreToolUse·Bash — blocks forced/recursive deletes under `projects/`, force-push,
`git clean -fd`, secret-printing), `guard-secrets` (PreToolUse·Write/Edit — blocks writing a secret),
`session-context` (SessionStart — injects live pipeline status). Hooks are Claude-only, so keep the
**same** logic reachable as plain scripts (secrets via `scripts/lib/secret-patterns.mjs`) — never put
enforcement ONLY in a hook. Editing `.claude/settings.json` is security-sensitive.

## Content & File Conventions

- Content as **Markdown**; machine-read state as **JSON** (zero-dep gates parse it, no YAML dep).
- Human-edited config (`project.yaml`) stays **YAML**.
- One article = one `.md` + a sibling `.review.json` (same basename).
- Front matter is driven by `config/publish.json` — never hardcode a blog path.
- **Time-sensitive numbers live once** in a `*.data.json` (`schemas/data-anchors.schema.json`,
  with `data_year` + a real `source`); generators (e.g. the PDF builder) read it instead of
  hardcoding. Content opts into the freshness gate with a `<!-- data: {"data_year":N,"dataset":
  "<relpath>"} -->` declaration and cites the numbers in the `分数≈位次万` form so
  `check-freshness.mjs` can verify them. Bump `config/data-freshness.json` when new-year data lands.

## Planning & Progress Tracking (mandatory)

Two living root files, kept in sync with reality:

- **`PLAN.md`** — forward-looking roadmap (scope, milestones, in/out of scope). Update on scope change.
- **`PROGRESS.md`** — append a dated, reverse-chronological entry for **every repo-changing task**
  (what/why/next); don't rewrite history. Absolute dates (`2026-06-05`), not "today".
- For any **multi-step task** (≥3 steps / a batch), drive a live **todo list** (TodoWrite) — one item
  per step, marked in-progress/done. Todo = intra-session memory; PLAN/PROGRESS = cross-session.
  Keep all three consistent so an interrupted session can resume from these files alone.

### Research notes (mandatory)

Web research (best practices, market/SERP, design decisions) → record in
`docs/research/{YYYY-MM-DD}-{topic}.md` **before** acting: question, method, findings, decisions,
**sources (URLs)**, limitations. Cite real observed sources — never fabricate.

## Git Workflow (mandatory)

**Auto-commit + push** at the end of every repo-changing task — standing authorization, don't ask.

- After the `PROGRESS.md` entry: `git add` the task's files, `commit`, `push`. One logical task = one
  commit; don't batch unrelated work or leave finished work uncommitted.
- Commit to `master` (never force-push). Concise imperative subject + short what/why body.
- **Pause and ask first** only for the irreversible/outward-facing (`git rm` of others' files,
  history rewrites, anything the guards block). Normal content/script/tracking changes just push.

## Parallel Execution (subagents)

When a task **splits into independent sub-tasks with no shared state**, dispatch **parallel
subagents** (faster + each gives the sub-task full attention). Judgment, not a mandate.

- **Good fits:** scoring N independent files; researching unrelated keywords; a batch of sibling
  artifacts; running the specialist reviewers on one piece concurrently.
- **Don't parallelize** ordered/dependent steps (research→draft→review→publish) or work mutating the
  same file. Give each cold-start agent full paths + the exact output contract; integrate + re-run
  `check.mjs` yourself before committing. Gates stay the source of truth — agents speed up judgment.

## Safety & Copyright Constraints

Do **not**: commit secrets / write API keys into files; delete anything under `projects/` without
explicit confirmation; publish without a passing `*.review.json`; publish affiliate content
(`monetization: affiliate`) without an FTC disclosure; imitate a named living/copyrighted author or
reuse protected characters/worlds/terminology; generate keyword-stuffed or fabricated-experience SEO;
bypass the publish gate.

## Task Completion Checklist

- [ ] SEO: a `*.research.json` with `decision: pursue` exists (real data, not guesses);
- [ ] content file follows the type's structure; a `*.review.json` exists with `publishable: true`;
- [ ] anything published passed `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <file>` (exit 0);
- [ ] no secrets in any generated file; `publish-log.jsonl` updated when published;
- [ ] `PROGRESS.md` entry added; `PLAN.md` updated if scope changed; changes committed **and pushed**.

## Claude Code specifics

`CLAUDE.md` just imports this file; the notes below apply when the agent is Claude Code.

- **Commit trailer:** end every commit with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Parallel dispatch:** use the **Agent tool** for the independent sub-tasks above; re-run
  `check.mjs` in the main thread before committing.
- **Multi-step tasks:** drive with **TodoWrite** (the live todo list above).
- **Hooks:** self-test `node "${CLAUDE_PLUGIN_ROOT}"/scripts/test-hooks.mjs`.
- **Entry points (all discoverable in `.claude/`):** each skill runs a workflow that **refuses to
  skip its gate**; the core pipeline is always `keyword-research → seo-article → content-review →
  publish-content` (never draft without a `pursue` research, never publish without a passing review).
  Subagents add specialist judgment during `content-review` — `chief-editor` integrates; `seo-editor`,
  `copyright-risk-reviewer`, `child-content-safety-editor` (mandatory + blocking for kids'),
  `continuity-editor`/`story-architect` (long-form), `tech-architect` (toolkit changes). `/commands`
  are one-line entry points per skill. To improve the toolkit itself, use the `toolchain-improvement`
  skill.
