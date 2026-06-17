# Children's-story readability bands (for the readability gate)

- **Date:** 2026-06-05
- **Topic:** Age-appropriate word-count and sentence-length thresholds for a single children's short story, to ground `scripts/check-readability.mjs` (the children-story deterministic gate).

## Question

What objectively-checkable thresholds (story length, average sentence length, longest
sentence) distinguish age-appropriate children's prose for the bands **3-5 / 6-8 / 9-12**, so the
gate enforces real guidance instead of invented numbers?

## Method

Web search (US index) of children's-publishing length guidelines and general readability research.
Synthesized two independent strands: (1) kidlit category length norms, (2) sentence-length /
comprehension research. These are heuristics, not a single validated formula — recorded as such.

## Key findings

- **Comprehension vs sentence length** (American Press Institute, via readability guidelines):
  sentences of **≤8 words → ~100% comprehension**; comprehension holds steady until **~20 words**,
  then **drops sharply**; **>43 words → <10%**. Flesch: readers start to struggle around **20 words**.
- **General writing guidance:** average sentence **≤15 words**, and **no sentence > 25 words**.
- **Picture books (≈3-5):** ~200–400 words typical (max ~600); often **1–2 short sentences per page**;
  tightly limited vocabulary.
- **Early readers (≈5-8):** deliberately **short sentences and simple storylines**; "tightly
  controlled language and word choice" to hit a reading level — simpler than many picture books.
- **Middle grade (≈9-12):** longer and more varied; **more complex sentences mixed with simple ones**.

## Decisions it drove

`check-readability.mjs` ships these per-band defaults **for one short story** (not a whole book —
publishing word counts are per-book; a single age-appropriate story is shorter). The story's
`.spec.json` may override any number; the gate carries the defaults so a spec only needs `age_band`.

| Band | word_count (min–max) | max avg sentence words | max single sentence words |
|------|----------------------|------------------------|---------------------------|
| 3-5  | 80–500               | 10                     | 16                        |
| 6-8  | 250–900              | 14                     | 22                        |
| 9-12 | 600–2500             | 17                     | 28                        |

Rationale: youngest band hugs the ~8–10-word "high-comprehension" zone; 6-8 stays under the ~20-word
difficulty onset on average; 9-12 averages below 20 but allows longer sentences (cap 28 ≈ the
25-word general ceiling plus middle-grade variety). All three caps sit at/under the sharp-drop zone.

## Limitations / honesty

- These are **editorial heuristics**, not a calibrated readability formula (no Flesch-Kincaid grade
  computation — that needs syllable counting, out of scope for a zero-dep word/sentence gate).
- Length norms are English-kidlit; a ZH children's story would want CJK-aware counting (the gate
  counts CJK characters as tokens, but the bands themselves are English-derived — revisit before a
  ZH sample).
- The gate is a **floor** (catches obviously age-inappropriate length/complexity), not a guarantee of
  quality or true reading level — semantic quality stays with `content-review`.

## Sources (observed)

- Sentence length / comprehension — Readability Guidelines (alpha): http://readabilityguidelines.wikidot.com/sentence-length
- Optimal sentence length for readability — https://lettercounter.org/blog/sentence-length-readability/
- Children's book length by age — Mary Kole Editorial: https://www.marykole.com/childrens-book-length
- Age levels for children's books — https://journeytokidlit.com/age-levels-for-childrens-books/
- Writing for early readers — Mary Kole Editorial: https://www.marykole.com/books-for-early-readers
- Children's books word count — https://self-publishingschool.com/childrens-books-word-count/
