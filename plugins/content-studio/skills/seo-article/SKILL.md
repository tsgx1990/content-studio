---
name: seo-article
description: Plan and draft an SEO article from a keyword and search intent, writing a Markdown draft under projects/{slug}/seo/. Use when the user wants a search-optimized article.
---

# seo-article

## When to use

The user wants an SEO article for a website: they give a keyword (and ideally a search
intent and audience), and want a search-optimized Markdown draft. Do **not** publish here
— this skill only plans + drafts. Review and publishing are separate skills.

## Inputs

```yaml
project: string            # projects/{slug} (create via project.yaml if missing)
keyword: string            # primary keyword
search_intent: informational | commercial | transactional | navigational
target_audience: string    # optional, infer if absent
word_count: number         # optional, default 1200–1800
# precondition: sibling {keyword-slug}.research.json (from keyword-research, decision=pursue)
```

## Outputs

- `projects/{slug}/seo/{lang}/{keyword-slug}.md` — the article draft (`{lang}` e.g. `en`/`zh`;
  NO front matter yet — front matter is generated at publish time from config/publish.json).
- The draft must end with a short `<!-- meta -->` HTML comment block holding the proposed
  `title`, `description`, and `tags` so the review step can lift them into the sidecar.

## Workflow

1. **Require keyword research (hard precondition).** Read the sibling
   `{keyword-slug}.research.json` (from the `keyword-research` skill). If it is missing,
   STOP and run `keyword-research` first — never draft on guesses. If its `decision` is not
   `pursue`, STOP and report the reason.
2. Confirm/create `projects/{slug}/project.yaml` (see template). Ground the article in the
   research: target the real `search_intent`, out-do the `serp_snapshot` competitors, cover
   the `related_queries`, and exploit the `content_gaps`.
3. Produce an outline: one H1, several H2/H3 covering the intent fully. Use
   `templates/outline.md` as the shape.
4. Draft the body in Markdown: clear structure, useful specifics, no keyword stuffing,
   natural keyword placement, an intro that answers the query early, and a FAQ section.
5. Propose `title` (≤60 chars), `description` (meta, ≤160 chars), and 3–6 `tags`.
6. Write the draft file. Append the `<!-- meta -->` block with the proposed metadata.
7. **Scrub AI tells (mandatory).** Run `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-ai-tells.mjs <draft.md>`. If it
   exits non-zero, the draft reads as machine-written — fix it and re-run until it passes
   (use `--strict` to also clear the advisory warnings). **For a ZH article** add
   `--compliance` (or `--compliance=education,medical,finance` for a regulated topic) so the
   prose is also scanned for 极限词/虚假宣传 (《广告法》绝对化用语 + industry promise-words) — the
   structured ZH gates cover note/script/drama JSON, but a long-form ZH article has no other
   compliance gate. The common offenders and the fix:
   - **em-dash overuse** — the #1 tell. Rewrite most `—` as periods, commas, or parentheses;
     keep at most a couple per article.
   - **clichés** (delve / tapestry / "in today's digital age" / "unleash the power" / …) — cut them.
   - **antithesis cliché** ("it's not X, it's Y", "not just … but also") — vary the sentence shapes.
   - **heading uniformity** — don't cut every H2/H3 from the same "Noun: phrase" colon mould.
   Beyond the scanner, write like a human: vary sentence length, prefer concrete specifics over
   abstract summary, and cut throat-clearing intros/"in conclusion" closers.
8. Tell the user to run `content-review` next.

## Quality gates

- No keyword stuffing; keyword density stays natural.
- The article fully satisfies the stated search intent.
- Clear H2/H3 hierarchy; scannable.
- Contains genuinely useful, specific information (not filler).
- Reads as human-written — passes `check-ai-tells.mjs` (no em-dash overuse, no AI clichés).
- If the topic is time-sensitive, add a note that facts need live verification.
- Original content only — no imitation of a named author or protected work.

## Failure handling

- If `search_intent` is unclear, ask once, then pick the most likely intent and state the assumption.
- If the keyword is ambiguous (multiple meanings), draft for the dominant intent and note alternatives.

## Examples

See `examples/` for an input brief and the resulting draft shape.
