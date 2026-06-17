# Content Studio

A **Claude Code plugin** that turns content production into a disciplined pipeline:
**research → draft → review → publish**, with deterministic, zero-dependency gates that refuse to
ship keyword-stuffed, fabricated, or non-compliant content.

It is *Claude Code native* — the workflow engine is the agent itself following a set of skills; the
only code is small `node` gate scripts (no build step, no `npm install`, no dependencies).

## What you get

- **Content-type skills** — SEO articles, long-form fiction, children's stories, YouTube scripts,
  Xiaohongshu (小红书) notes, short dramas (微短剧), graded readers, interactive/game/audio stories.
- **Editorial subagents** — a chief editor, SEO editor, copyright-risk reviewer, a (mandatory,
  blocking) child-content-safety editor, and long-form continuity/architecture reviewers.
- **Deterministic gates** — one per content type plus shared publish, AI-tell, freshness, and
  Chinese-marketing-compliance scanners. The gates, not trust, are the source of truth.

## Install

```text
/plugin marketplace add tsgx1990/content-studio
/plugin install content-studio@content-studio
```

Then, in any content workspace, the skills are available (e.g. `/keyword-research`, `/seo-article`,
`/content-review`, `/publish-content`). Skills are namespaced by the plugin, e.g.
`/content-studio:seo-article`.

> Updating: bump the plugin and the marketplace, push, and users run `/plugin update`. Pinning a
> `version` in the manifest means users only receive updates when you bump it.

## The pipeline (mandatory)

No content reaches a publish target without going through:

```text
research → draft → review → (revise) → publish-gate → write to target
```

- **research** (`keyword-research`) writes a `*.research.json` with REAL SERP data and a
  pursue/skip decision. Drafting on guesses is the failure this prevents.
- **draft** (a content skill) is grounded in that research and refuses without it.
- **review** (`content-review` + specialist subagents) writes a `*.review.json` sidecar.
- **publish** (`publish-content`) runs the publish gate and refuses if it exits non-zero.

## Content types

| type | source of truth | gate |
|---|---|---|
| seo-article | `seo/{lang}/{kw}.md` + `.research.json` | check-prepublish |
| novel / long-form | `novel/state.json` | check-continuity |
| children-story | `stories/{lang}/{s}.spec.json` | check-readability |
| interactive-fiction | `if/{lang}/{s}.if.json` | check-storygraph |
| youtube-script | `video/{lang}/{s}.script.json` | check-script |
| xhs-post (小红书) | `xhs/{lang}/{s}.note.json` | check-xhsnote |
| short-drama (微短剧) | `drama/{lang}/{s}.drama.json` | check-short-drama |
| english-learning-story | `learn/{lang}/{s}.lesson.json` | check-graded-reader |
| game-story | `game/{lang}/{s}.game.json` | check-game-story |
| audio-story | `audio/{lang}/{s}.audio.json` | check-audio-story |

## Using the gates directly

Every gate is a plain `node` script under the plugin's `scripts/`. From your content workspace:

```bash
node "$CLAUDE_PLUGIN_ROOT"/scripts/check.mjs                         # is my content healthy?
node "$CLAUDE_PLUGIN_ROOT"/scripts/check-prepublish.mjs <content.md> # the publish gate
node "$CLAUDE_PLUGIN_ROOT"/scripts/check-batch.mjs <dir|path ...>    # triage a batch
```

The gates resolve their schemas relative to themselves and look for your `projects/` in the current
working directory, so they work the same whether run in this repo or installed as a plugin.

If `${CLAUDE_PLUGIN_ROOT}` is not set in your shell, use the bundled fallback commands instead — they
resolve the plugin path for you:

```text
/content-studio:cs-check                                  # full health check
/content-studio:cs-gate check-prepublish.mjs <content.md> # any gate, by name, with args
```

## Set up a content workspace

1. Copy `plugins/content-studio/.env.example` to `.env` and `plugins/content-studio/config/publish.json.example`
   to `config/publish.json`, then edit the publish target.
2. Create `projects/<your-project>/project.yaml` and start with `/keyword-research`.
3. See the worked example under `projects/` in this repo for the full shape.

## Repository layout

```text
.claude-plugin/marketplace.json     # this repo is a single-plugin marketplace
plugins/content-studio/             # the plugin (self-contained)
  .claude-plugin/plugin.json
  skills/ agents/ commands/         # the workflow
  hooks/hooks.json                  # safety hooks (guard deletes/secrets)
  scripts/ schemas/                 # the deterministic gates + their contracts
  docs/                             # design + research notes the skills cite
projects/                           # a worked example workspace
```

## Contributing

Improvements stay **zero-dependency Node + Markdown skills + JSON schemas**. A behavior change
ships with a deterministic `scripts/test-*.mjs` wired into `check.mjs`. Run `node
plugins/content-studio/scripts/check.mjs` and keep it green.

## License

[Apache-2.0](./LICENSE).
