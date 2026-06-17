---
name: youtube-script
description: Write a YouTube video script as a structured, role-segmented narration (hook/intro/segment/cta), then render it to a teleprompter Markdown doc. The script (.script.json) is the source of truth and is enforced by the deterministic script gate (hook first, a CTA, estimated runtime within tolerance of the target length, hook short enough). Topic must come from real keyword-research — never invent demand.
---

# youtube-script

## When to use

The user wants a script for a YouTube (or similar) video on a topic. One run = one script. Full
content vertical: the script schema + the script gate + the shared review/publish gates.

## Real-data first (same rule as SEO)

A video competes in search/recommendation exactly like an article. So **topic selection reuses the
SEO entry point**: run `keyword-research` for the video's topic and only proceed on a `pursue`
`*.research.json`. Put that keyword in the script's `keyword` field. Do not invent search demand or
fabricate stats in the narration.

## Why a structured script + a script gate

A video's avoidable failures are structural and pacing-related: no hook (or the hook buried after a
long intro), no call to action, or a script that is wildly the wrong length for the target. Those are
reproducibly checkable. The script lives as **role-segmented narration** (`{slug}.script.json`) and
`scripts/check-script.mjs` enforces: the first section is a `hook`, there is a `cta`, the estimated
runtime (narration words / wpm) is within tolerance of `target_seconds`, and the hook is short enough
(~≤15s). Pacing numbers are grounded in `docs/research/2026-06-06-youtube-script-pacing.md`. Whether
the hook is *compelling* stays with `content-review`.

## Inputs

```yaml
project: string          # projects/{slug}; project.yaml type: youtube-script
keyword: string          # the topic — must have a pursue *.research.json
target_seconds: number   # intended video length (e.g. 60 for a Short, 480 for a mid-form video)
language: string         # default "en"
words_per_minute: number # optional; default 150 (use ~125 for slow/educational delivery)
```

## Outputs (under projects/{slug}/video/{lang}/)

- `{slug}.script.json` — the **script** (source of truth): `target_seconds`, optional `words_per_minute`,
  and `sections[]` of `{ role, title, narration, visual? }`. First section role `hook`; include a `cta`.
- `{slug}.md` — the **rendered** teleprompter doc: title, then a section per beat with the narration and
  any `[VISUAL: …]` note, plus an estimated-runtime line. This is what gets reviewed + published.
- `{slug}.review.json` — `content-review` sidecar (`content_type: youtube-script`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml` with `type: youtube-script`.
2. Ensure a `pursue` `keyword-research` sidecar exists for the topic (run `keyword-research` if not).
3. **Write the script** (`{slug}.script.json`): open with a tight `hook` (the first ~10s — a
   pattern-interrupt / open loop / clear value promise), then `intro` (why watch), `segment`s (the
   body beats), and a `cta`. Keep narration to spoken words; put camera/b-roll in `visual`.
4. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-script.mjs projects/{slug}/video/{lang}/{slug}.script.json`. Fix
   until it exits 0 (it reports sections / words / estimated seconds). Adjust narration length to hit
   the target, or set `words_per_minute` if you script for a slower delivery. Also
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs {slug}.script.json` for the schema alone.
5. **Render to `{slug}.md`** — do NOT hand-assemble it; run the deterministic renderer so the doc
   never drifts from the script JSON:
   `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs projects/{slug}/video/{lang}/{slug}.script.json --write`. It emits the
   title, a runtime-estimate line (using the same pacing math as the gate), and one section per beat
   (`## Title  (role)` + narration + `> [VISUAL: …]` / `> [画面：…]`), language-aware from `language`.
6. **Review:** run `content-review` → `{slug}.review.json` (`content_type: youtube-script`, metadata
   title/description/tags). For a script with affiliate links, set `monetization: affiliate` (the
   publish gate then requires an FTC disclosure).

## Quality gates

- A `pursue` `*.research.json` exists for the topic (real-data rule).
- `{slug}.script.json` passes `check-script.mjs` (and `validate-sidecar`).
- `content-review` marks it `publishable: true`, `copyright_risk: low`.
- The hook actually hooks (a reason to keep watching in the first line), not just "Hi, welcome back."

## Failure handling

- Gate says runtime is off → add/cut narration, or set `words_per_minute` to your real delivery rate;
  don't game the target by padding `visual` (visuals aren't counted) — fix the narration.
- Gate says the hook is too long → split: a one-line hook, then move the rest into `intro`.
- No real keyword demand (`decision: skip`) → reconsider the topic; don't script on a guess.
