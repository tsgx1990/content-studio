# Running the gates

Content Studio enforces its workflow with **deterministic gate scripts** (one per content type, plus
shared publish / AI-tell / freshness / compliance scanners). The gates — not trust — decide whether a
piece is publishable. This doc covers how to run them once the plugin is installed.

## Two ways to run a gate

### 1. Direct (what the skills do)

The gates are plain `node` scripts bundled with the plugin. The skills call them through the
`${CLAUDE_PLUGIN_ROOT}` variable, which points at the plugin's install directory:

```bash
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check.mjs                          # is my content healthy?
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prepublish.mjs <content.md>  # the publish gate
node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-batch.mjs <dir|path ...>     # triage a batch
```

### 2. Fallback commands (always reliable)

`${CLAUDE_PLUGIN_ROOT}` is **guaranteed** to be substituted inside a plugin command's `` !`…` ``
injection (per the Claude Code plugin reference). So if that variable is ever *not* set in an ad-hoc
shell, use the bundled commands instead — they resolve the plugin path for you and feed the gate
output straight back:

```text
/content-studio:cs-check                                   # full health check (no args)
/content-studio:cs-gate <script.mjs> [args]                # any gate, by name, with args
```

Examples:

```text
/content-studio:cs-gate check-prepublish.mjs projects/my-site/seo/en/foo.md
/content-studio:cs-gate check-batch.mjs projects/my-site/xhs/zh
/content-studio:cs-gate check-ai-tells.mjs projects/my-site/seo/en/foo.md --strict --compliance
```

These commands' descriptions are self-explanatory, so an agent that hits a missing-variable error on
the direct path can discover and switch to them on its own.

## How paths resolve (why it works in-repo *and* installed)

The gates deliberately separate **their own files** from **your content**:

- **Schemas & shared libs** resolve *relative to the script* (`scripts/` ↔ `schemas/` are siblings
  inside the plugin), so they travel with the plugin and are always found.
- **Your `projects/` and `config/publish.json`** resolve from the **current working directory** — i.e.
  your content workspace. The publish gate reads the front-matter requirements from *your*
  `config/publish.json`; copy `config/publish.json.example` and edit it before publishing.

A consequence: a brand-new workspace with no `projects/` yet still reports `✔ repo healthy` — the
toolkit's own self-tests pass and there is simply no content to gate. That is expected.

## Common gates

| gate | what it checks |
|---|---|
| `check.mjs` | repo-wide health: every sidecar, every drafted article's publish gate, all self-tests |
| `check-prepublish.mjs <file.md>` | the publish gate (review sidecar present + `publishable: true`; SEO also needs a `pursue` research) |
| `check-batch.mjs <paths>` | per-file readiness triage across a batch |
| `check-ai-tells.mjs <file.md> [--strict] [--compliance]` | AI-tell prose scan (EN+ZH); `--compliance` adds 极限词/承诺词 |
| `validate-sidecar.mjs <sidecar.json>` | validate a sidecar against its schema |
| `render.mjs <source.json> [--write]` | render a note/script/lesson/drama JSON source to canonical `.md` |
| per-type gates | `check-xhsnote.mjs`, `check-script.mjs`, `check-short-drama.mjs`, `check-readability.mjs`, `check-storygraph.mjs`, `check-graded-reader.mjs`, `check-game-story.mjs`, `check-audio-story.mjs`, `check-continuity.mjs` |

Each script documents its exact rules in its header comment.
