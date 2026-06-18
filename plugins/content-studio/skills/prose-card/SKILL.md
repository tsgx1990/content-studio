# prose-card

## When to use

The user wants a short piece of **plain narrative prose** — a micro-story, a flash-fiction card, a
cultural 微故事, an app-embedded story snippet, a "story card". One run = one card. This is the
**lightweight** content vertical: a structured source + a small gate + the shared review/publish gates.

Reach for this — not `audio-story` — whenever the deliverable is just *text*. `audio-story` exists to
script narrated audio drama (declared voices, sound cues, TTS-safety + runtime gates); forcing a
pure-text micro-story through it is empty scaffolding. If the piece will actually be voiced, use
`audio-story`. If it's words on a card/screen, use this.

## Why a structured source + a gate

A prose card's only mechanical failure modes are length (a "card" that's secretly an essay, or too
thin to be a story) and — for branded/marketing cards — 极限词/承诺词 (广告法 risk). Those are
reproducibly checkable; "is the story any good?" (voice, arc, payoff) is `content-review`'s job. The
piece lives as `{slug}.prose.json` and `scripts/check-prose.mjs` enforces a sane title, a **CJK-aware**
length band (a 汉字 and a Latin word each count 1, so a ~250-字 Chinese card and a ~250-word English
one are judged on the same scale), and an **opt-in** ZH compliance scan.

## Inputs

```yaml
project: string     # projects/{slug}; project.yaml type: prose-card (or any type — cards live under prose/)
language: string    # "en" or "zh" (drives CJK-aware counting + the compliance scan)
keyword: string     # OPTIONAL topic; if the card serves search/recommendation demand, back it with a pursue *.research.json
```

Topic demand is optional here (a micro-story isn't always chasing a keyword). If the card IS meant to
rank/recommend (a branded 高考 micro-story, an SEO story snippet), reuse `keyword-research` first and
record the keyword — don't invent demand.

## Outputs (under projects/{slug}/prose/{lang}/)

- `{slug}.prose.json` — the **source of truth**: `prose_id`, `title`, `body` (paragraphs separated by
  blank lines), optional `summary` (a one-line hook), optional `tags[]`, optional `length` override
  (`min`/`max`/`title_max` in CJK-aware units), optional `compliance` block (presence = opt in to the
  极限词/承诺词 scan; `compliance.industries` adds education/medical/finance promise words).
- `{slug}.md` — the **rendered** card (title, optional summary blockquote, body, optional tags). Render
  it; don't hand-write it.
- `{slug}.review.json` — `content-review` sidecar (`content_type: prose-card`).

## Workflow

1. Confirm/create `projects/{slug}/project.yaml`; cards live under `prose/{lang}/`.
2. (Optional) If the card chases demand, ensure a `pursue` `keyword-research` sidecar exists.
3. **Write the card** (`{slug}.prose.json`): a tight `title`, the `body` as real narrative prose
   (default band 60–800 units — keep it a *card*, not a chapter), optional `summary`/`tags`. For a
   **branded/marketing** card, add a `compliance` block (and `industries` if it touches
   教育/医疗/金融) so absolute/guarantee claims get caught.
4. **Gate it:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-prose.mjs projects/{slug}/prose/{lang}/{slug}.prose.json`. Fix
   until it exits 0 (it reports title/body units). Also `node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-sidecar.mjs` for the
   schema alone.
5. **Render to `{slug}.md`:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/render.mjs <…>.prose.json --write` — never hand-assemble
   the .md (it would drift from the JSON).
6. **Scrub AI 味:** `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs projects/{slug}/prose/{lang}/{slug}.md` (it
   auto-detects ZH; add `--strict` to clear warnings, `--compliance` for branded ZH prose). A
   micro-story that reads machine-written isn't shippable.
7. **Review:** run `content-review` → `{slug}.review.json` (`content_type: prose-card`). Stop before
   publishing unless asked.

## Quality gates

- `{slug}.prose.json` passes `check-prose.mjs` (and `validate-sidecar`).
- The rendered `.md` clears `check-ai-tells` (no BLOCK-tier tells).
- `content-review` marks it `publishable: true`, `copyright_risk: low` (original premise; no protected
  characters/worlds — see `copyright-risk-reviewer`).

## Failure handling

- Gate says body too short/long → it's a *card*; tighten the prose or set a `length` override only if
  you genuinely mean a different band (don't pad with filler).
- Gate flags a 极限词/承诺词 → you opted into compliance for a reason; soften the claim honestly.
- It's really an audio piece → switch to `audio-story`. It's really a children's story with a
  reading-level target → use `children-story`. This vertical is for plain adult/general prose cards.
