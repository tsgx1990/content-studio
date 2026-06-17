---
name: content-strategy
description: Decide WHAT to make and for whom before any drafting — positioning, audience, differentiation, and a concrete content-series plan. Applies to every content type; feeds keyword-research (SEO) or story-bible (long-form). Proposes; it does not fabricate market data.
---

# content-strategy

## When to use

At the very start of a project (or when picking the next batch), before `keyword-research` /
`story-bible` / drafting. It answers "what should this site/series be, for whom, and why us?" and
produces an executable plan. It is the only planning step that spans all content types.

## Honesty boundary (important)

This skill **proposes** directions from reasoning about the goal/audience; it does **not** invent
market numbers. For SEO, every proposed topic is a *candidate* that `keyword-research` must
validate against REAL SERP data before drafting (a candidate can still come back `skip/defer`).
Never present a strategic guess as validated demand.

## Inputs

```yaml
project: string            # projects/{slug} (create project.yaml if missing)
content_type: seo-article | novel | (other, when added)
user_goal: string          # what success looks like (traffic, audience, portfolio, sales…)
target_audience: string    # who it's for (sharpen if vague)
platform: website | youtube | xiaohongshu | podcast | game | …
monetization_goal: traffic | ads | affiliate | subscription | brand | portfolio | none
feedback: string|null      # OPTIONAL projects/{slug}/*.feedback.json — real-traffic evidence
                           # for picking the NEXT batch (the data-feedback loop). null on a new site.
```

## Data feedback (the loop closes here)

When this is **not** a brand-new project, prefer evidence over reasoning. If the user has published
and exported analytics, run the loop first:

```bash
node "${CLAUDE_PLUGIN_ROOT}"/scripts/build-topic-feedback.mjs <slug>   # reads projects/<slug>/analytics/*.csv (GSC/GA4 export)
```

It writes `projects/{slug}/*.feedback.json` with `published_performance` (winners / underperformers)
and ranked `opportunities`, plus `suggestions` of three kinds:

- **double-down** — a proven winner → plan more in that cluster;
- **revise** — high-impression / low-CTR page → fix title/intent (not a new piece);
- **new-topic** — a query the site is seen for but doesn't own → a candidate next article.

Fold these into the series plan as **evidence-backed candidates**. Crucial honesty rule: a
`new-topic` suggestion is still **unvalidated** (the script even stamps `status: "unvalidated"`) —
it must pass `keyword-research` with real SERP data before drafting, exactly like any other
candidate. Never treat a feedback suggestion as confirmed demand.

## Outputs

- `projects/{slug}/content-plan.md` — positioning, audience, content angle, **differentiation**
  (why this wins vs what already exists), a **content-series plan of ≥3 concrete, executable
  items**, internal-linking/series structure, and **risks**. Mark SEO items as *unvalidated
  candidates pending `keyword-research`*.

## Workflow

1. Confirm/create `projects/{slug}/project.yaml`.
2. Clarify the **audience** until it is specific (not "people interested in X").
3. Define **positioning + differentiation**: what angle is genuinely under-served, and why this
   project can own it. Avoid vague, me-too topics.
4. Produce the **content-series plan**: ≥3 specific pieces, each with a one-line angle and how it
   ties to the monetization goal (informational→ads, commercial→affiliate, etc.).
5. State **risks** (competition, seasonality, E-E-A-T/authority needs, policy/copyright).
6. Write `content-plan.md`. Point to the next step:
   - SEO → run `keyword-research` on each candidate (real data decides pursue/skip).
   - long-form → run `story-bible` to lay the foundation.

## Quality gates

- The audience is specific and the differentiation is explicit (not generic).
- At least **3** concrete, executable themes — no vague topics.
- SEO items are labeled **unvalidated** until `keyword-research` confirms them with real data.
- Monetization fit is stated per item; risks are named honestly.

## Failure handling

- Goal/audience too vague to differentiate → ask one sharpening question, then proceed with a
  stated assumption.
- If the niche looks saturated with no real gap, say so and recommend a narrower angle — an honest
  "too crowded" beats a hopeful plan (same spirit as the research decision gate).
